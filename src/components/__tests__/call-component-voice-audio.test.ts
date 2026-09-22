import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guard for the "voice calls connect on the wire
 * but the UI never leaves Connecting... and no audio ever plays" bug.
 *
 * vitest here runs with environment: "node" (see vitest.config.ts) -
 * there is no DOM to render into, so this asserts on the source instead,
 * matching the convention in call-context-connection-lifecycle.test.ts.
 *
 * Root cause, confirmed via a real, live two-browser Playwright call
 * (both users logged in, a real production build, a real Postgres, real
 * fake-media WebRTC negotiation): the ONLY element that ever attached
 * remoteStream to something the browser will actually play - a <video>
 * ref - only rendered when `showRemoteVideo` (`remoteStream && isVideo`)
 * was already true. For any voice call isVideo is always false, so that
 * <video> element never mounted, remoteVideoRef.current stayed null
 * forever, remoteStream's audio track was handed to nothing, and the
 * effect that calls setIsConnecting(false) never ran - a real, fully
 * connected voice call showed a permanent "Connecting..." spinner in
 * total silence. Video calls were unaffected (isVideo true), which is
 * why this bug is voice-specific.
 */

const CALL_COMPONENT_FILE = path.resolve(__dirname, "../CallComponent.tsx");
const read = () => fs.readFileSync(CALL_COMPONENT_FILE, "utf8");

describe("CallComponent: remote media element is not gated behind showRemoteVideo", () => {
  const source = read();

  it("renders the remote <video> unconditionally, not only when showRemoteVideo is true", () => {
    // The old, broken shape was `{showRemoteVideo ? (<video .../>) : (<div>...fallback...</div>)}`
    // - the video element's own existence depended on showRemoteVideo.
    // It must now always be in the tree; only its visibility may depend
    // on showRemoteVideo.
    expect(source).not.toMatch(/\{showRemoteVideo\s*\?\s*\(\s*<video/);
    const videoIdx = source.indexOf("<video\n            ref={remoteVideoRef}");
    expect(videoIdx).toBeGreaterThan(-1);
  });

  it("still hides the remote video visually when showRemoteVideo is false, via className not existence", () => {
    expect(source).toMatch(/className=\{showRemoteVideo \? "w-full h-full object-cover" : "hidden"\}/);
  });

  it("keeps the fallback overlay (ringing/connecting/no-video) as a sibling, gated on !showRemoteVideo", () => {
    expect(source).toContain("{!showRemoteVideo && (");
  });

  it("never tells a connected voice call it has no camera", () => {
    // A voice call has no camera at all - "No video / Camera is off" is
    // the correct message only for a VIDEO call whose camera is toggled
    // off, not for a successfully connected voice call reaching this
    // same fallback branch (showRemoteVideo is always false for voice).
    const fallbackIdx = source.indexOf("{!showRemoteVideo && (");
    const fallbackBody = source.slice(fallbackIdx, fallbackIdx + 1600);
    expect(fallbackBody).toContain("!isVideo ?");
    // The "!isVideo" branch must appear before the final "No video" one,
    // so a voice call never falls through to it.
    const voiceBranchIdx = fallbackBody.indexOf("!isVideo ?");
    const noVideoIdx = fallbackBody.indexOf("No video");
    expect(voiceBranchIdx).toBeGreaterThan(-1);
    expect(noVideoIdx).toBeGreaterThan(voiceBranchIdx);
  });
});
