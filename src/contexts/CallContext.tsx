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
import Peer from "simple-peer";
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
  const callerIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const endingCallRef = useRef(false);
  const socketRef = useRef<any>(null);

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
      callerIdRef.current = incomingCallerId;
      callIdRef.current = callId ?? null;
      setIsVideoCall(isVideo);
      setIncomingSignal(signal);
      setCallState("incoming");
    };

    const onCallAccepted = ({ signal }: any) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    };

    const onCallRejected = () => {
      endCallInternal();
      setCallError(t("chat.callRejected"));
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
    callerIdRef.current = null;
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
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }),
        getIceServers(),
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

      const newPeer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: { iceServers },
      });

      peerRef.current = newPeer;

      newPeer.on("signal", (signal) => {
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
      });

      newPeer.on("stream", (remote) => {
        reportCallDiagnostic("caller-remote-stream-received");
        setRemoteStream(remote);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => {
        reportCallDiagnostic("caller-ice-state", { state });
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
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: isVideoCall,
          audio: true,
        }),
        getIceServers(),
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

      newPeer.on("signal", (signal) => {
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
        setRemoteStream(remote);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => {
        reportCallDiagnostic("receiver-ice-state", { state });
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
    if (callerIdRef.current) {
      socketRef.current?.emit("reject-call", {
        callerId: callerIdRef.current,
        callId: callIdRef.current ?? undefined,
      });
    }
    setCallState("idle");
    setIncomingSignal(null);
    setCallerId(null);
    callerIdRef.current = null;
    callIdRef.current = null;
  }

  function endCall() {
    const hadCallerId = callerIdRef.current;
    endCallInternal();
    if (hadCallerId) {
      socketRef.current?.emit("end-call", {
        callerId: hadCallerId,
        callId: callIdRef.current ?? undefined,
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
