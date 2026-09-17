import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Regression guard for a real, measured bundle-size bug: CallContext.tsx
 * used to `import Peer from "simple-peer"` at module top level. Because
 * CallProvider is mounted app-wide in the root layout (see
 * call-provider-placement.test.ts for why - a call must be receivable
 * from any screen), that static import shipped simple-peer plus its
 * readable-stream/get-browser-rtc dependencies (~100KB built, ~29KB
 * gzipped) to EVERY page load for EVERY user, even the overwhelming
 * majority who never place or receive a call in a session.
 *
 * Confirmed via the built app-build-manifest.json: the chunk containing
 * "simple-peer" was reachable from the "/layout" entry (i.e. loaded on
 * every route) before the fix, and was not reachable from "/layout" at
 * all afterward - only from the on-demand chunk created by the dynamic
 * import() inside startCall/acceptCall, which is exactly where `new
 * Peer(...)` is actually constructed (call time, not mount time).
 *
 * This guard can't re-run a full production build (too slow for a unit
 * test and this repo's vitest environment is "node", no bundler access -
 * see call-provider-placement.test.ts's own comment), so it locks in the
 * source-level shape that produces that build result: no static
 * value-level import of "simple-peer", a type-only import for the
 * `Peer.Instance` ref type instead, and a dynamic import() at each of
 * the two places a Peer is actually constructed.
 */

const CALL_CONTEXT_FILE = path.resolve(__dirname, "../CallContext.tsx");

describe("CallContext lazy-loads simple-peer instead of bundling it app-wide", () => {
  const source = fs.readFileSync(CALL_CONTEXT_FILE, "utf8");

  it("does not statically value-import simple-peer at module scope", () => {
    expect(source).not.toMatch(/^import Peer from ["']simple-peer["']/m);
  });

  it("uses a type-only import for the Peer.Instance ref type", () => {
    expect(source).toMatch(/import type Peer from ["']simple-peer["']/);
  });

  it("loads simple-peer via a dynamic import() at both call-construction sites", () => {
    const dynamicImportCount = (source.match(/import\(["']simple-peer["']\)/g) || []).length;
    expect(dynamicImportCount).toBe(2);
  });

  it("still constructs exactly two Peer instances (startCall + acceptCall), unchanged behavior", () => {
    const newPeerCount = (source.match(/new Peer\(\{/g) || []).length;
    expect(newPeerCount).toBe(2);
  });
});
