import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guards for the "a call starts but never
 * connects, and nothing ever tells either side" bug class.
 *
 * vitest here runs with environment: "node" (see vitest.config.ts) -
 * there is no DOM/WebRTC to actually run a peer connection against, so
 * these assert on the source instead, matching the convention already
 * established in call-provider-placement.test.ts and
 * call-context-lazy-peer.test.ts.
 */

const CALL_CONTEXT_FILE = path.resolve(__dirname, "../CallContext.tsx");
const read = () => fs.readFileSync(CALL_CONTEXT_FILE, "utf8");

describe("caller-side hangup notifies the other party (ghost call fix)", () => {
  it("no longer has a callerIdRef that only the callee's path ever writes", () => {
    // The real bug: a ref literally named callerIdRef, written only
    // from onIncomingCall (the callee's path). startCall() (the
    // caller's own path) never wrote it, so endCall() - which reads it
    // to know who to notify - silently skipped the end-call emit
    // whenever the CALLER hung up. Renamed to otherPartyIdRef and now
    // written from both directions; a reintroduction of the old,
    // one-sided name is exactly the regression this guards against.
    const source = read();
    // Only checks actual code usage, not this file's own explanatory
    // comment about the old name (which deliberately mentions it).
    expect(source).not.toMatch(/callerIdRef\.current/);
    expect(source).not.toMatch(/const callerIdRef/);
    expect(source).toContain("otherPartyIdRef");
  });

  it("startCall() writes otherPartyIdRef to the receiver being called", () => {
    const source = read();
    const idx = source.indexOf("async function startCall(");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, source.indexOf("async function acceptCall("));
    expect(body).toContain("otherPartyIdRef.current = receiverId");
  });

  it("onIncomingCall still writes otherPartyIdRef to the caller who called us", () => {
    const source = read();
    const idx = source.indexOf("const onIncomingCall = (");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 700);
    expect(body).toContain("otherPartyIdRef.current = incomingCallerId");
  });

  it("endCall() reads the callId BEFORE endCallInternal() clears it, not after", () => {
    // Second real bug in the same function: callId was read from
    // callIdRef.current AFTER endCallInternal() already nulled it out,
    // so the end-call emit always carried callId: undefined - silently
    // defeating the server's generation/CAS check for every real call.
    const source = read();
    const idx = source.indexOf("function endCall() {");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 600);
    const captureIdx = body.indexOf("const callId = callIdRef.current");
    const internalIdx = body.indexOf("endCallInternal();");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(internalIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeLessThan(internalIdx);
  });
});

describe("silent connection failures now produce a real, user-visible outcome", () => {
  const source = read();

  it("gives up on its own stalled ICE gathering instead of ringing forever", () => {
    // trickle:false (both here and Android's own PeerConnection) waits
    // for ICE gathering to fully finish before "signal" ever fires. If
    // gathering stalls - unreachable STUN/TURN, a network that blocks
    // the required ports - that event previously never fired, and
    // call-user/accept-call was simply never sent, with the UI stuck on
    // "Calling.../Connecting..." forever and nothing logged but a
    // diagnostic no one would ever read live.
    expect(source).toContain("signalTimeoutRef");
    expect(source).toContain("SIGNAL_TIMEOUT_MS");
    const startIdx = source.indexOf("async function startCall(");
    const acceptIdx = source.indexOf("async function acceptCall(");
    expect(source.slice(startIdx, acceptIdx)).toContain("signalTimeoutRef.current = setTimeout(");
    expect(source.slice(acceptIdx, source.indexOf("function rejectCall("))).toContain(
      "signalTimeoutRef.current = setTimeout("
    );
  });

  it("reacts to WebRTC's own terminal iceConnectionState('failed') instead of only logging it", () => {
    // The single closest match to "the action starts, but the
    // connection isn't completed": once signaling succeeds and both
    // peers are negotiating, iceConnectionState can legitimately
    // transition to "failed" (no viable route between the two peers -
    // symmetric NAT, corporate firewall, TURN unreachable/
    // misconfigured). WebRTC throws no exception for this. The handler
    // previously only called reportCallDiagnostic and did nothing else
    // - the call stayed open, showing "Connecting..." with a peer that
    // will never connect.
    const iceHandlerStarts: number[] = [];
    let searchFrom = 0;
    for (;;) {
      const idx = source.indexOf('newPeer.on("iceStateChange", (state) => {', searchFrom);
      if (idx === -1) break;
      iceHandlerStarts.push(idx);
      searchFrom = idx + 1;
    }
    expect(iceHandlerStarts.length).toBe(2); // startCall + acceptCall
    for (const start of iceHandlerStarts) {
      const end = source.indexOf('newPeer.on("connect"', start);
      const handler = source.slice(start, end);
      expect(handler).toContain('state === "failed"');
      expect(handler).toContain("endCall()");
    }
  });

  it("gives an unanswered outgoing call a real timeout instead of ringing forever", () => {
    expect(source).toContain("answerTimeoutRef");
    expect(source).toContain("ANSWER_TIMEOUT_MS");
    const idx = source.indexOf('newPeer.on("signal", (signal) => {');
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 1000);
    expect(body).toContain("answerTimeoutRef.current = setTimeout(");
  });

  it("clears every pending call timeout whenever the call actually resolves", () => {
    // A timeout firing after the call already connected/ended/was
    // rejected would incorrectly show a stale error over a call that
    // is, by then, in a completely different state.
    expect(source).toContain("function clearCallTimeouts()");
    const onAcceptedIdx = source.indexOf("const onCallAccepted = (");
    expect(source.slice(onAcceptedIdx, onAcceptedIdx + 200)).toContain("clearCallTimeouts()");
    const endInternalIdx = source.indexOf("function endCallInternal() {");
    expect(source.slice(endInternalIdx, endInternalIdx + 200)).toContain("clearCallTimeouts()");
    // Both "stream" handlers (the call actually connecting) also clear -
    // there are exactly two, startCall's and acceptCall's.
    const streamHandlers = source.match(/newPeer\.on\("stream", \(remote\) => \{[\s\S]{0,200}?\}\);/g) || [];
    expect(streamHandlers.length).toBe(2);
    for (const handler of streamHandlers) {
      expect(handler).toContain("clearCallTimeouts()");
    }
  });
});

describe("rejection reason reaches the user instead of one generic message for every case", () => {
  it("distinguishes an unreachable/offline receiver from a real decline", () => {
    // server.js already sends `reason: "unavailable"` /
    // `reason: "service-unavailable"` for a receiver who was never
    // actually reachable - previously ignored client-side, so a person
    // whose contact was simply offline saw "Call was rejected", which
    // reads as a real decision by a real person, not a network fact.
    const source = read();
    const idx = source.indexOf("const onCallRejected = (");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 600);
    expect(body).toContain('reason === "unavailable"');
    expect(body).toContain('reason === "service-unavailable"');
    expect(body).toContain("chat.callUnavailable");
    expect(body).toContain("chat.callRejected");
  });
});
