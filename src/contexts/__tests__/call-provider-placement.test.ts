import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ⚠️ REGRESSION GUARD for a real production bug: the client's
// socket.on("incoming-call", ...) handler used to be registered inside
// src/app/messages/[username]/page.tsx - a per-conversation page
// component, torn down (socketRef.current.off("incoming-call")) the
// moment that page unmounted. That meant a user could only ever RECEIVE
// a call while they happened to already have that exact 1:1 conversation
// thread open; anywhere else in the app nothing was listening, so the
// caller's screen rang forever with no response. Confirmed via a real
// device recording (20+ seconds of "Ringing..." with zero resolution).
//
// The fix (src/contexts/CallContext.tsx) hoists the whole call state
// machine into an app-wide provider mounted once at the root layout
// (src/app/layout.tsx), the same place PresenceProvider/
// UnreadCountProvider already live for the identical "must survive
// navigation" reason.
//
// This repo has no jsdom/React Testing Library setup (Vitest's test
// environment is "node" only, see vitest.config.ts) - adding one just
// for this fix is out of scope for tonight's release and its own source
// of risk. What IS testable without any new dependency, on the existing
// plain-Node test environment, is the actual defect class itself:
// structurally guaranteeing (a) CallProvider is actually wired into the
// root layout, and (b) no page under src/app registers its own raw
// "incoming-call"/"call-accepted"/"call-rejected"/"call-ended" socket
// listener outside of CallContext.tsx - which is exactly the mistake
// that caused this bug and the one most likely to be silently
// reintroduced by a future page-level "quick fix".
const SRC_DIR = path.resolve(__dirname, "../../");
const APP_DIR = path.join(SRC_DIR, "app");
const CALL_CONTEXT_FILE = path.join(SRC_DIR, "contexts", "CallContext.tsx");
const LAYOUT_FILE = path.join(APP_DIR, "layout.tsx");

const CALL_SOCKET_EVENTS = [
  "incoming-call",
  "call-accepted",
  "call-rejected",
  "call-ended",
];

function listFilesRecursive(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(full);
    if (/\.(ts|tsx)$/.test(entry.name)) return [full];
    return [];
  });
}

describe("call signaling listener placement", () => {
  it("registers CallProvider at the root layout (survives navigation for the whole session)", () => {
    const layoutSource = fs.readFileSync(LAYOUT_FILE, "utf8");
    expect(layoutSource).toMatch(/import\s+\{\s*CallProvider\s*\}\s+from\s+["']@\/contexts\/CallContext["']/);
    expect(layoutSource).toMatch(/<CallProvider>/);
  });

  it("owns every incoming-call/call-accepted/call-rejected/call-ended listener in CallContext.tsx, not any page", () => {
    const callContextSource = fs.readFileSync(CALL_CONTEXT_FILE, "utf8");
    for (const event of CALL_SOCKET_EVENTS) {
      expect(callContextSource).toContain(`"${event}"`);
    }

    const appFiles = listFilesRecursive(APP_DIR).filter(
      (file) => file !== CALL_CONTEXT_FILE
    );

    const offenders: string[] = [];
    for (const file of appFiles) {
      const source = fs.readFileSync(file, "utf8");
      for (const event of CALL_SOCKET_EVENTS) {
        // Matches `.on("incoming-call"` / `.off("incoming-call"` etc. -
        // a page registering (or even just tearing down) its own raw
        // listener for one of these events is the exact regression
        // class this guard exists to catch, regardless of whether the
        // rest of the call logic was copied correctly.
        const pattern = new RegExp(`\\.(on|off)\\(\\s*["']${event}["']`);
        if (pattern.test(source)) {
          offenders.push(`${path.relative(SRC_DIR, file)} registers "${event}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
