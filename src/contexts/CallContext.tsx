"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
// Type-only: simple-peer (+ its readable-stream/get-browser-rtc deps, ~100KB
// built) is loaded as a real value only inside startCall/acceptCall below,
// via a dynamic import(). This provider is mounted app-wide in the root
// layout so every incoming call can be answered from any screen (see the
// comment above), which previously meant `import Peer from "simple-peer"`
// shipped that ~100KB to every single page load for every user, even the
// overwhelming majority who never place or receive a call in a session -
// confirmed via the built app-build-manifest.json, where the chunk
// containing simple-peer was reachable from "/layout" (loaded on every
// route) rather than only from call-related screens.
import type Peer from "simple-peer";
import { getSocket } from "@/lib/socket-client";
import { useLanguage } from "@/contexts/LanguageContext";
import CallComponent from "@/components/CallComponent";

// ⚠️ ROOT CAUSE THIS FILE FIXES: incoming-call handling used to live
// entirely inside src/app/messages/[username]/page.tsx - registered in
// a mount-time useEffect and explicitly torn down
// (socketRef.current.off("incoming-call")) on unmount. That means a
// user could only ever RECEIVE a call while they happened to already
// have that exact 1:1 conversation thread open. Anywhere else in the
// app - the home feed, a different chat, Explore, the messages list
// itself - nothing was listening, so the caller's screen just rang
// forever with no response, indistinguishable from the callee being
// unreachable. Confirmed via a real device recording: the caller's
// "Ringing..." screen never resolved for 20+ seconds. This is not a
// signaling/TURN/Redis bug - the server-side call-user/incoming-call
// relay (server.js) already works; the client simply wasn't listening
// unless it happened to be on the right screen.
//
// The fix: hoist the entire call state machine (previously local state
// in the messages page) into this app-wide provider, mounted once at
// the root layout (see src/app/layout.tsx) alongside the other
// always-on providers (PresenceProvider, UnreadCountProvider) that
// already follow this exact pattern for the same reason - presence and
// unread counts also need to work regardless of which page is open.
// getSocket() itself was already a true module-level singleton (see
// socket-client.ts) that survives navigation - only the *listener
// registration* was page-scoped, which is what actually broke this.
//
// CallComponent is rendered once here, as a fixed full-screen overlay
// (it already is `fixed inset-0 ... z-50`, see CallComponent.tsx) that
// appears above whatever page is currently mounted - so an incoming
// call now interrupts the user wherever they are in the app, instead
// of only being visible on one specific conversation route.
type CallState = "idle" | "calling" | "incoming" | "active";

interface CallContextValue {
  callState: CallState;
  isVideoCall: boolean;
  callerName: string;
  callError: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** receiverId/receiverName: who the outgoing call is placed to - the caller's own page passes these in, since CallProvider itself has no per-conversation data (an incoming call already carries callerName from the server, see socket.on("incoming-call") below). */
  startCall: (
    receiverId: string,
    receiverName: string,
    isVideo: boolean
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  clearCallError: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall() must be used inside <CallProvider>");
  }
  return ctx;
}

const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function reportCallDiagnostic(event: string, detail?: unknown) {
  fetch("/api/call-diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, detail }),
  }).catch(() => {});
}

async function getIceServers(): Promise<any[]> {
  try {
    const res = await fetch("/api/turn-credentials");
    if (!res.ok) throw new Error(`TURN request failed: ${res.status}`);
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length > 0) {
      reportCallDiagnostic("ice-servers-fetched", { count: servers.length });
      return servers;
    }
    reportCallDiagnostic("ice-servers-empty-fallback");
    return FALLBACK_ICE_SERVERS;
  } catch (err) {
    reportCallDiagnostic("ice-servers-fetch-failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return FALLBACK_ICE_SERVERS;
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const userId = session?.user?.id;

  const [callState, setCallState] = useState<CallState>("idle");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [callerId, setCallerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<any>(null);

  // Refs mirror every piece of state a socket-event handler needs to
  // read, for the exact reason documented in the original
  // messages/[username]/page.tsx implementation this was extracted
  // from: handlers registered once (here, at provider-mount time) close
  // over the state from that render, which is stale by the time an
  // event actually arrives. Every setter below also writes the
  // matching ref; anything read from inside a socket handler reads the
  // ref, never the state variable directly.
  const peerRef = useRef<Peer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // ⚠️ REAL BUG THIS FIXES: named `callerIdRef` and only ever written
  // from the callee's own onIncomingCall handler below - startCall()
  // (the caller's own path) never wrote it. endCall()/rejectCall() both
  // read it to know who the "other party" is to notify. That's correct
  // for a callee hanging up (the other party IS the caller), but for a
  // caller hanging up - including cancelling before the callee ever
  // answers - `otherPartyIdRef.current` was null, so the end-call emit
  // at the bottom of endCall() was silently skipped: the callee's UI
  // never learned the call ended and was left stuck showing an active
  // or ringing call indefinitely (a ghost call). Renamed to
  // `otherPartyIdRef` and now written from both startCall() (the
  // receiver being called) and onIncomingCall() (the caller who called
  // us), so it always holds the id of whoever is on the other end,
  // regardless of which side placed the call.
  const otherPartyIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const endingCallRef = useRef(false);
  const socketRef = useRef<any>(null);
  // ⚠️ REAL BUG THIS FIXES: neither of these timeouts existed before.
  // A callee who never answers left the caller's "Calling..." screen
  // ringing forever with no way out but reloading the page (the exact
  // failure mode documented at the top of this file for the OLD
  // incoming-call bug, just from the other side). Separately - and this
  // is the one that most directly matches "the action starts, but the
  // connection isn't completed" - simple-peer's own `trickle: false`
  // mode waits for ICE gathering to fully complete before it ever fires
  // its one "signal" event; if gathering stalls (an unreachable STUN/
  // TURN server, a network that blocks the required UDP/TCP ports) that
  // event may simply never fire, so `call-user`/`accept-call` is never
  // even sent - and once it IS sent and the other side is negotiating,
  // WebRTC's iceConnectionState can transition to "failed" with no
  // exception thrown anywhere for a caller/callee that got this far but
  // still can't actually route media between each other (symmetric NAT,
  // corporate firewall, TURN misconfigured). Both of those previously
  // left the call sitting in "Calling.../Connecting..." forever, with
  // only a diagnostic log (reportCallDiagnostic) and no user-facing
  // error or cleanup at all.
  const signalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SIGNAL_TIMEOUT_MS = 20_000;
  const ANSWER_TIMEOUT_MS = 45_000;

  function clearCallTimeouts() {
    if (signalTimeoutRef.current) {
      clearTimeout(signalTimeoutRef.current);
      signalTimeoutRef.current = null;
    }
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    const socket = getSocket(userId);
    socketRef.current = socket;

    const onIncomingCall = ({
      callerId: incomingCallerId,
      signal,
      callerName: incomingCallerName,
      isVideo,
      callId,
    }: any) => {
      setCallerName(incomingCallerName);
      setCallerId(incomingCallerId);
      otherPartyIdRef.current = incomingCallerId;
      callIdRef.current = callId ?? null;
      setIsVideoCall(isVideo);
      setIncomingSignal(signal);
      setCallState("incoming");
    };

    const onCallAccepted = ({ signal }: any) => {
      clearCallTimeouts();
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    };

    const onCallRejected = ({ reason }: any = {}) => {
      endCallInternal();
      // `reason` is additive (server.js) - an older/never-updated server
      // still sends a bare event, which falls through to the original,
      // generic "rejected" wording exactly as before.
      setCallError(
        reason === "unavailable" || reason === "service-unavailable"
          ? t("chat.callUnavailable")
          : t("chat.callRejected")
      );
    };

    const onCallEnded = () => {
      endCallInternal();
    };

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-accepted", onCallAccepted);
    socket.on("call-rejected", onCallRejected);
    socket.on("call-ended", onCallEnded);

    // Deliberately NO cleanup that removes these listeners on a
    // dependency change within a normal session - this provider is
    // mounted once at the app root (src/app/layout.tsx) for the whole
    // authenticated session, unlike the old per-page registration this
    // replaces. It only tears down if the user's id actually changes
    // (a real account switch) or the provider itself unmounts (app
    // shutdown), matching getSocket()'s own singleton-per-user
    // contract in socket-client.ts.
    return () => {
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-accepted", onCallAccepted);
      socket.off("call-rejected", onCallRejected);
      socket.off("call-ended", onCallEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  function endCallInternal() {
    endingCallRef.current = true;
    clearCallTimeouts();

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    setRemoteStream(null);
    setCallState("idle");
    setIncomingSignal(null);
    setCallerId(null);
    otherPartyIdRef.current = null;
    callIdRef.current = null;
    setCallerName("");
  }

  async function startCall(
    receiverId: string,
    receiverName: string,
    isVideo: boolean
  ) {
    setCallError(null);
    endingCallRef.current = false;

    try {
      const [stream, iceServers, { default: Peer }] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }),
        getIceServers(),
        import("simple-peer"),
      ]);

      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoCall(isVideo);
      setCallState("calling");
      // The callee's incoming-call UI shows this until it learns the
      // real caller name from its own session - shown immediately on
      // the caller's own "Ringing..." screen via callerName below, not
      // sent anywhere yet, so seed it now for symmetry with acceptCall.
      setCallerName(receiverName);
      // See the REAL BUG comment on otherPartyIdRef's declaration above:
      // this line is the actual fix - it was never written on the
      // caller's own path before.
      otherPartyIdRef.current = receiverId;

      const newPeer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: { iceServers },
      });

      peerRef.current = newPeer;

      // See the REAL BUG comment on signalTimeoutRef's declaration
      // above: if simple-peer's own ICE gathering (trickle:false waits
      // for it to fully finish before "signal" ever fires) stalls, this
      // is what turns silence into a real, user-visible failure instead
      // of "Calling..." forever.
      signalTimeoutRef.current = setTimeout(() => {
        if (endingCallRef.current) return;
        reportCallDiagnostic("caller-signal-timeout");
        setCallError(t("chat.connectionFailed"));
        endCallInternal();
      }, SIGNAL_TIMEOUT_MS);

      newPeer.on("signal", (signal) => {
        if (signalTimeoutRef.current) {
          clearTimeout(signalTimeoutRef.current);
          signalTimeoutRef.current = null;
        }
        socketRef.current?.emit(
          "call-user",
          {
            receiverId,
            signal,
            callerName: session?.user?.name || "User",
            isVideo,
            callerId: userId,
          },
          (response?: { callId?: string }) => {
            callIdRef.current = response?.callId ?? null;
          }
        );
        // The callee may never answer at all (offline, ignored,
        // declined without the client emitting reject-call for some
        // reason) - see the REAL BUG comment above. Cleared by
        // onCallAccepted/onCallRejected/onCallEnded, or by the "stream"
        // handler below, whichever resolves the call first.
        answerTimeoutRef.current = setTimeout(() => {
          if (endingCallRef.current) return;
          reportCallDiagnostic("caller-no-answer-timeout");
          setCallError(t("chat.callNoAnswer"));
          endCall();
        }, ANSWER_TIMEOUT_MS);
      });

      newPeer.on("stream", (remote) => {
        reportCallDiagnostic("caller-remote-stream-received");
        clearCallTimeouts();
        setRemoteStream(remote);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => {
        reportCallDiagnostic("caller-ice-state", { state });
        // See the REAL BUG comment on signalTimeoutRef's declaration
        // above: WebRTC itself never throws for this - "failed" is a
        // legitimate terminal state (e.g. no route between the two
        // peers exists at all, TURN unreachable/misconfigured) that
        // this simply never checked for before, leaving the call stuck
        // showing "Connecting..." with a live peer that will never
        // connect.
        if (state === "failed" && !endingCallRef.current) {
          setCallError(t("chat.connectionFailed"));
          endCall();
        }
      });

      newPeer.on("connect", () => {
        reportCallDiagnostic("caller-peer-connected");
      });

      newPeer.on("error", (err: any) => {
        if (endingCallRef.current) return;
        reportCallDiagnostic("caller-peer-error", {
          message: err?.message || String(err),
        });
        setCallError(
          t("chat.connectionError") + " " + (err?.message || String(err))
        );
        endCallInternal();
      });
    } catch (error: any) {
      setCallError(
        t("chat.micCameraError") +
          " " +
          (error?.name || "") +
          " " +
          (error?.message || String(error))
      );
      setCallState("idle");
    }
  }

  async function acceptCall() {
    setCallError(null);
    endingCallRef.current = false;

    try {
      const [stream, iceServers, { default: Peer }] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: isVideoCall,
          audio: true,
        }),
        getIceServers(),
        import("simple-peer"),
      ]);

      setLocalStream(stream);
      localStreamRef.current = stream;

      const newPeer = new Peer({
        initiator: false,
        trickle: false,
        stream,
        config: { iceServers },
      });

      peerRef.current = newPeer;

      // See the REAL BUG comment on signalTimeoutRef's declaration in
      // startCall() above - same failure mode, callee side: if this
      // side's own ICE gathering stalls, "signal" never fires and
      // accept-call is never sent, leaving both parties stuck.
      signalTimeoutRef.current = setTimeout(() => {
        if (endingCallRef.current) return;
        reportCallDiagnostic("receiver-signal-timeout");
        setCallError(t("chat.connectionFailed"));
        rejectCall();
      }, SIGNAL_TIMEOUT_MS);

      newPeer.on("signal", (signal) => {
        if (signalTimeoutRef.current) {
          clearTimeout(signalTimeoutRef.current);
          signalTimeoutRef.current = null;
        }
        if (callerId) {
          socketRef.current?.emit("accept-call", {
            callerId,
            signal,
            callId: callIdRef.current ?? undefined,
          });
        } else {
          setCallError(t("chat.missingCallerId"));
        }
      });

      newPeer.on("stream", (remote) => {
        reportCallDiagnostic("receiver-remote-stream-received");
        clearCallTimeouts();
        setRemoteStream(remote);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => {
        reportCallDiagnostic("receiver-ice-state", { state });
        // See the matching comment in startCall()'s own iceStateChange
        // handler - the same terminal WebRTC state, callee side.
        if (state === "failed" && !endingCallRef.current) {
          setCallError(t("chat.connectionFailed"));
          endCall();
        }
      });

      newPeer.on("connect", () => {
        reportCallDiagnostic("receiver-peer-connected");
      });

      newPeer.on("error", (err: any) => {
        if (endingCallRef.current) return;
        reportCallDiagnostic("receiver-peer-error", {
          message: err?.message || String(err),
        });
        setCallError(
          t("chat.connectionError") + " " + (err?.message || String(err))
        );
        endCallInternal();
      });

      if (incomingSignal) {
        newPeer.signal(incomingSignal);
      }
    } catch (error: any) {
      setCallError(
        t("chat.micCameraError") +
          " " +
          (error?.name || "") +
          " " +
          (error?.message || String(error))
      );
      rejectCall();
    }
  }

  function rejectCall() {
    clearCallTimeouts();
    if (otherPartyIdRef.current) {
      socketRef.current?.emit("reject-call", {
        callerId: otherPartyIdRef.current,
        callId: callIdRef.current ?? undefined,
      });
    }
    setCallState("idle");
    setIncomingSignal(null);
    setCallerId(null);
    otherPartyIdRef.current = null;
    callIdRef.current = null;
  }

  function endCall() {
    // Both captured BEFORE endCallInternal() runs, which clears both
    // refs to null as part of resetting to idle - reading either
    // AFTER that call (as this previously did for callId) sends
    // `undefined`, always, silently defeating the CAS generation check
    // callId exists for in the first place (see socket-authz.js's
    // GENERATION RACE comment on createCallRegistry).
    const otherPartyId = otherPartyIdRef.current;
    const callId = callIdRef.current;
    endCallInternal();
    if (otherPartyId) {
      socketRef.current?.emit("end-call", {
        callerId: otherPartyId,
        callId: callId ?? undefined,
      });
    }
  }

  return (
    <CallContext.Provider
      value={{
        callState,
        isVideoCall,
        callerName,
        callError,
        localStream,
        remoteStream,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        clearCallError: () => setCallError(null),
      }}
    >
      {children}
      {callState !== "idle" && (
        <CallComponent
          isIncoming={callState === "incoming"}
          callerName={callerName}
          isVideo={isVideoCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          localStream={localStream}
          remoteStream={remoteStream}
        />
      )}
    </CallContext.Provider>
  );
}
