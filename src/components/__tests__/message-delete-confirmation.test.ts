import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Message deletion - frontend confirmation/error-handling regression.
 *
 * The release-critical bug ("message deletion is broken everywhere") was
 * not in the DELETE API (see
 * src/app/api/messages/delete/[id]/__tests__/route.integration.test.ts,
 * which already covered it and passed). It was that both chat
 * components gated the entire delete flow behind `window.confirm()`,
 * and error reporting behind `window.alert()`. Verified live (Playwright,
 * dialogs auto-dismissed to simulate an environment that silently
 * suppresses them - iOS standalone PWA, in-app browsers like Telegram's,
 * Capacitor's WebView - all real ZRP deployment surfaces): the delete
 * button worked and the request never fired, because
 * `if (!confirm(...)) return;` took the early return unconditionally.
 *
 * vitest runs environment: "node" here (no DOM), matching this repo's
 * existing convention for frontend regressions (see
 * chat-presence-header.test.ts) - these are source guards, not rendered
 * component tests.
 */
const root = process.cwd();

// Comments are stripped before the "no window.confirm/alert" assertions
// specifically - this file's own doc comments legitimately mention
// confirm()/alert() by name to explain why they were removed, which
// isn't a use of either. Structural lookups (finding a specific JSX
// section) use the raw source instead, since a JSX comment like
// `{/* Delete */}` is itself a real anchor those tests search for.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const chatSrcRaw = fs.readFileSync(path.join(root, "src/components/ChatInterface.tsx"), "utf8");
const groupSrcRaw = fs.readFileSync(path.join(root, "src/components/GroupChatInterface.tsx"), "utf8");
const confirmModalSrcRaw = fs.readFileSync(path.join(root, "src/components/ConfirmModal.tsx"), "utf8");

describe.each([
  ["ChatInterface.tsx (1:1)", chatSrcRaw],
  ["GroupChatInterface.tsx (group)", groupSrcRaw],
])("%s - message delete no longer depends on native dialogs", (_label, raw) => {
  const src = stripComments(raw);

  // Scoped to the delete flow's own two functions (from requestDeleteMessage
  // through the end of confirmPendingDelete) - other, unrelated call sites
  // in this file (upload failures, mic access, send failures) legitimately
  // still use window.alert() and are out of scope for this fix.
  const deleteFlowSrc = (() => {
    const start = src.indexOf("const requestDeleteMessage");
    expect(start).toBeGreaterThan(-1);
    const afterConfirmFn = src.indexOf("\n  };", src.indexOf("const confirmPendingDelete", start));
    expect(afterConfirmFn).toBeGreaterThan(start);
    return src.slice(start, afterConfirmFn);
  })();

  it("never calls window.confirm()/confirm() to gate deletion", () => {
    // A bare `confirm(` call (not `confirmPendingDelete`/`ConfirmModal`/
    // etc.) is the exact regression - assert it is gone entirely.
    expect(deleteFlowSrc).not.toMatch(/[^a-zA-Z.]confirm\(/);
  });

  it("never calls alert() to report a delete failure", () => {
    expect(deleteFlowSrc).not.toMatch(/[^a-zA-Z.]alert\(/);
  });

  it("imports and renders the in-app ConfirmModal", () => {
    expect(src).toContain('import ConfirmModal from "@/components/ConfirmModal"');
    expect(src).toContain("<ConfirmModal");
  });

  it("opens the modal (does not delete directly) from the delete button", () => {
    // The button's onClick calls the request function, not a function
    // that hits the network directly.
    expect(src).toContain("requestDeleteMessage(");
  });

  it("only actually deletes from a distinct confirm handler, gated on a pending id", () => {
    expect(src).toContain("confirmPendingDelete");
    expect(src).toContain("pendingDeleteId");
    expect(src).toMatch(/const messageId = pendingDeleteId;\s*\n\s*if \(!messageId\) return;/);
  });

  it("still calls the authoritative DELETE API from the confirm handler", () => {
    expect(src).toContain("/api/messages/delete/${messageId}");
    expect(src).toContain('method: "DELETE"');
  });

  it("still relays the deletion over the socket for realtime consistency", () => {
    expect(src).toContain("socketRef.current?.emit(");
    expect(src).toContain('"delete-message"');
  });

  it("shows delete errors as in-app UI, not a native alert", () => {
    expect(src).toContain("setDeleteError(");
    expect(src).toMatch(/role="alert"[\s\S]{0,40}aria-live="polite"/);
  });

  it("auto-clears the error banner instead of leaving it stuck forever", () => {
    expect(src).toMatch(/setTimeout\(\(\) => setDeleteError\(null\), 4000\)/);
  });
});

describe("ConfirmModal", () => {
  const src = stripComments(confirmModalSrcRaw);

  it("is a real dialog, not window.confirm", () => {
    expect(src).not.toMatch(/[^a-zA-Z.]confirm\(/);
    expect(src).toContain('role="alertdialog"');
    expect(src).toContain('aria-modal="true"');
  });

  it("supports Escape-to-cancel and does not act while busy", () => {
    expect(src).toContain('"Escape"');
    expect(src).toContain("!busy");
  });

  it("marks the confirm button destructive styling only when asked", () => {
    expect(src).toContain("destructive");
    expect(src).toContain("bg-zrp-red");
  });
});

describe("ownership gating is preserved (unchanged by this fix)", () => {
  it("ChatInterface only shows the delete action for the message's own sender", () => {
    // isOwn gates rendering of the Delete button in the message actions
    // row - this must survive the confirm()-removal refactor unchanged.
    const deleteSectionIdx = chatSrcRaw.indexOf("{/* Delete */}");
    expect(deleteSectionIdx).toBeGreaterThan(-1);
    const section = chatSrcRaw.slice(deleteSectionIdx, deleteSectionIdx + 200);
    expect(section).toContain("isOwn &&");
  });

  it("GroupChatInterface only shows the delete action when canDelete() allows it", () => {
    expect(groupSrcRaw).toContain("canDelete(message)");
    expect(groupSrcRaw).toContain('message.senderId === userId || myRole === "OWNER"');
  });
});
