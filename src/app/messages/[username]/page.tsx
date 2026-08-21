"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import CallComponent from "@/components/CallComponent";
import { getSocket } from "@/lib/socket-client";
import Peer from "simple-peer";
import { useLanguage } from "@/contexts/LanguageContext";

const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Nothing shows up in browser devtools when testing from a phone/iPad
// with no console access, so ICE state changes and peer errors had no
// way to reach anywhere visible. This mirrors them to
// /api/call-diagnostics, which logs straight to the Railway server
// console - same place the socket server's own logs already show up -
// so a failed call attempt leaves a visible trail without needing
// devtools. Deliberately fire-and-forget (no await, swallow errors) so
// a diagnostics-logging failure can never itself break a call.
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

    if (!res.ok) {
      throw new Error(`TURN request failed: ${res.status}`);
    }

    const servers = await res.json();

    if (Array.isArray(servers) && servers.length > 0) {
      console.log(
        "🧊 Using fetched TURN/STUN servers:",
        servers.length,
        "entries"
      );
      reportCallDiagnostic("ice-servers-fetched", { count: servers.length });
      return servers;
    }

    console.warn(
      "🧊 TURN fetch returned empty/invalid, using fallback"
    );
    reportCallDiagnostic("ice-servers-empty-fallback");

    return FALLBACK_ICE_SERVERS;
  } catch (err) {
    console.error(
      "🧊 Failed to fetch TURN credentials, using fallback:",
      err
    );
    reportCallDiagnostic("ice-servers-fetch-failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return FALLBACK_ICE_SERVERS;
  }
}

export default function ChatPage(
  props: { params: Promise<{ username: string }> }
) {
  const params = use(props.params);

  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [receiver, setReceiver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [callState, setCallState] = useState<
    "idle" | "calling" | "incoming" | "active"
  >("idle");

  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [callerId, setCallerId] = useState<string | null>(null);

  const [localStream, setLocalStream] =
    useState<MediaStream | null>(null);

  const [remoteStream, setRemoteStream] =
    useState<MediaStream | null>(null);

  const [peer, setPeer] =
    useState<Peer.Instance | null>(null);

  // The socket listeners below (registered once in setupSocket(), via
  // a mount-time useEffect) close over React state from the render
  // they were created in - peer/localStream/callerId were all still
  // null at that point, since a call hadn't started yet. Without
  // these refs, "call-accepted" always saw peer as null and never
  // actually called peer.signal(answerSignal), so the caller's side
  // of the connection never received the callee's answer and the UI
  // hung on "Ringing…"/"Connecting…" forever - the exact symptom
  // reported. Refs are always current regardless of which closure
  // reads them, so every place that sets the state below also writes
  // the matching ref, and anything invoked from inside a socket
  // handler reads the ref instead of the (potentially stale) state.
  const peerRef = useRef<Peer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callerIdRef = useRef<string | null>(null);

  const [incomingSignal, setIncomingSignal] =
    useState<any>(null);

  const [callError, setCallError] =
    useState<string | null>(null);

  const socketRef = useRef<any>(null);

  /*
   * The chat must occupy exactly the visible viewport area.
   *
   * This is especially important on:
   * - iPhone
   * - iPad
   * - Safari
   * - Android browsers
   *
   * visualViewport is used when available because the normal
   * window.innerHeight value can remain larger than the actual
   * visible area when the mobile keyboard is open.
   */
  const containerRef = useRef<HTMLDivElement>(null);

  const [availableHeight, setAvailableHeight] =
    useState<number | null>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const container = containerRef.current;

      if (!container) return;

      const rect = container.getBoundingClientRect();

      const viewportHeight =
        window.visualViewport?.height ??
        window.innerHeight;

      const top = Math.max(0, rect.top);

      const height = Math.max(
        0,
        viewportHeight - top
      );

      setAvailableHeight(height);
    };

    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    window.visualViewport?.addEventListener(
      "resize",
      updateHeight
    );

    window.visualViewport?.addEventListener(
      "scroll",
      updateHeight
    );

    const firstTimeout = window.setTimeout(
      updateHeight,
      100
    );

    const secondTimeout = window.setTimeout(
      updateHeight,
      500
    );

    return () => {
      window.removeEventListener(
        "resize",
        updateHeight
      );

      window.removeEventListener(
        "orientationchange",
        updateHeight
      );

      window.visualViewport?.removeEventListener(
        "resize",
        updateHeight
      );

      window.visualViewport?.removeEventListener(
        "scroll",
        updateHeight
      );

      window.clearTimeout(firstTimeout);
      window.clearTimeout(secondTimeout);
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (
      status === "authenticated" &&
      userId
    ) {
      fetchReceiver();
      setupSocket();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off("incoming-call");
        socketRef.current.off("call-accepted");
        socketRef.current.off("call-rejected");
        socketRef.current.off("call-ended");
      }

      if (peerRef.current) {
        peerRef.current.destroy();
      }

      if (localStreamRef.current) {
        localStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, [
    status,
    userId,
    params.username,
  ]);

  const fetchReceiver = async () => {
    try {
      const res = await fetch(
        `/api/users/${params.username}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          `Failed to fetch user: ${res.status}`
        );
      }

      const data = await res.json();

      setReceiver(data);
    } catch (error) {
      console.error(
        "Error fetching receiver:",
        error
      );
      setReceiver(null);
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    if (!userId) return;

    const socket = getSocket(userId);

    socketRef.current = socket;

    socket.on(
      "incoming-call",
      ({
        callerId,
        signal,
        callerName,
        isVideo,
      }) => {
        console.log(
          "📞 Incoming call from",
          callerName
        );

        setCallerName(callerName);
        setCallerId(callerId);
        callerIdRef.current = callerId;
        setIsVideoCall(isVideo);
        setIncomingSignal(signal);
        setCallState("incoming");
      }
    );

    socket.on(
      "call-accepted",
      ({ signal }) => {
        console.log(
          "✅ Call accepted by receiver"
        );

        if (peerRef.current) {
          peerRef.current.signal(signal);
        }
      }
    );

    socket.on("call-rejected", () => {
      console.log("❌ Call rejected");

      endCall();

      setCallError(
        t("chat.callRejected")
      );
    });

    socket.on("call-ended", () => {
      console.log(
        "🔚 Call ended by other party"
      );

      endCall();
    });
  };

  const startCall = async (
    isVideo: boolean
  ) => {
    setCallError(null);

    try {
      const [
        stream,
        iceServers,
      ] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: isVideo,
          audio: true,
        }),
        getIceServers(),
      ]);

      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoCall(isVideo);
      setCallState("calling");

      const newPeer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: {
          iceServers,
        },
      });

      peerRef.current = newPeer;

      newPeer.on(
        "signal",
        (signal) => {
          console.log(
            "📡 Signal sent to",
            receiver.username
          );

          socketRef.current?.emit(
            "call-user",
            {
              receiverId: receiver.id,
              signal,
              callerName:
                session?.user?.name ||
                "User",
              isVideo,
              callerId: userId,
            }
          );
        }
      );

      newPeer.on(
        "stream",
        (remoteStream) => {
          console.log(
            "📡 Remote stream received"
          );
          reportCallDiagnostic("caller-remote-stream-received");

          setRemoteStream(remoteStream);
          setCallState("active");
        }
      );

      newPeer.on(
        "iceStateChange",
        (state) => {
          console.log(
            "🧊 ICE state:",
            state
          );
          reportCallDiagnostic("caller-ice-state", { state });
        }
      );

      newPeer.on(
        "connect",
        () => {
          console.log(
            "✅ Peer connected!"
          );
          reportCallDiagnostic("caller-peer-connected");
        }
      );

      newPeer.on(
        "error",
        (err) => {
          console.error(
            "❌ Peer error:",
            err
          );
          reportCallDiagnostic("caller-peer-error", {
            message: err?.message || String(err),
          });

          setCallError(
            t("chat.connectionError") +
              " " +
              (err?.message ||
                String(err))
          );

          endCall();
        }
      );

      setPeer(newPeer);
    } catch (error: any) {
      console.error(
        "Error starting call:",
        error
      );

      setCallError(
        t("chat.micCameraError") +
          " " +
          (error?.name || "") +
          " " +
          (error?.message ||
            String(error))
      );

      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    setCallError(null);

    try {
      console.log(
        "🔵 Accepting call..."
      );

      const [
        stream,
        iceServers,
      ] = await Promise.all([
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
        config: {
          iceServers,
        },
      });

      peerRef.current = newPeer;

      newPeer.on(
        "signal",
        (signal) => {
          console.log(
            "📡 Sending accept signal to callerId",
            callerId
          );

          if (callerId) {
            socketRef.current?.emit(
              "accept-call",
              {
                callerId,
                signal,
              }
            );
          } else {
            console.error(
              "❌ No callerId to accept"
            );

            setCallError(
              t("chat.missingCallerId")
            );
          }
        }
      );

      newPeer.on(
        "stream",
        (remoteStream) => {
          console.log(
            "📡 Remote stream received (accept)"
          );
          reportCallDiagnostic("receiver-remote-stream-received");

          setRemoteStream(remoteStream);
          setCallState("active");
        }
      );

      newPeer.on(
        "iceStateChange",
        (state) => {
          console.log(
            "🧊 ICE state (accept):",
            state
          );
          reportCallDiagnostic("receiver-ice-state", { state });
        }
      );

      newPeer.on(
        "connect",
        () => {
          console.log(
            "✅ Peer connected (accept)!"
          );
          reportCallDiagnostic("receiver-peer-connected");
        }
      );

      newPeer.on(
        "error",
        (err) => {
          console.error(
            "❌ Peer error (accept):",
            err
          );
          reportCallDiagnostic("receiver-peer-error", {
            message: err?.message || String(err),
          });

          setCallError(
            t("chat.connectionError") +
              " " +
              (err?.message ||
                String(err))
          );

          endCall();
        }
      );

      if (incomingSignal) {
        console.log(
          "📡 Signaling with incoming offer"
        );

        newPeer.signal(
          incomingSignal
        );
      }

      setPeer(newPeer);
    } catch (error: any) {
      console.error(
        "Error accepting call:",
        error
      );

      setCallError(
        t("chat.micCameraError") +
          " " +
          (error?.name || "") +
          " " +
          (error?.message ||
            String(error))
      );

      rejectCall();
    }
  };

  const rejectCall = () => {
    if (callerIdRef.current) {
      socketRef.current?.emit(
        "reject-call",
        {
          callerId: callerIdRef.current,
        }
      );
    }

    setCallState("idle");
    setIncomingSignal(null);
    setCallerId(null);
    callerIdRef.current = null;
  };

  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
      setPeer(null);
    }

    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      localStreamRef.current = null;
      setLocalStream(null);
    }

    setRemoteStream(null);
    setCallState("idle");
    setIncomingSignal(null);

    if (callerIdRef.current) {
      socketRef.current?.emit(
        "end-call",
        {
          callerId: callerIdRef.current,
        }
      );
    }

    setCallerId(null);
    callerIdRef.current = null;
    setCallerName("");
  };

  if (
    status === "loading" ||
    loading
  ) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500 dark:text-gray-400">
          {t("action.loading")}
        </div>
      </div>
    );
  }

  if (!receiver) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-4">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <p className="text-red-700 dark:text-red-300 font-medium">
            {t("chat.userNotFound")}
          </p>

          <Link
            href="/messages"
            className="
              text-zrp-red
              hover:underline
              text-sm
              mt-2
              inline-flex
              items-center
              gap-1
            "
          >
            <ArrowLeft className="w-4 h-4" />
            {t("chat.backToMessages")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main
      ref={containerRef}
      className="
        w-full
        max-w-full
        mx-auto
        px-0
        sm:px-3
        lg:px-4
        pt-0
        sm:pt-2
        lg:pt-3
        pb-0
        flex
        flex-col
        min-h-0
        overflow-hidden
      "
      style={{
        height: availableHeight
          ? `${availableHeight}px`
          : "calc(100dvh - env(safe-area-inset-top))",

        paddingBottom:
          "env(safe-area-inset-bottom)",
      }}
    >
      {/* Call error */}
      {callError && (
        <div
          className="
            fixed
            top-4
            left-1/2
            -translate-x-1/2
            z-[100]
            bg-red-600
            text-white
            text-sm
            px-4
            py-2.5
            rounded-xl
            shadow-xl
            max-w-[calc(100vw-32px)]
            sm:max-w-md
            text-center
          "
        >
          {callError}

          <button
            type="button"
            onClick={() =>
              setCallError(null)
            }
            className="ml-3 underline font-medium"
          >
            {t("chat.dismiss")}
          </button>
        </div>
      )}

      {callState === "idle" ? (
        <>
          {/* Mobile back button */}
          <div
            className="
              lg:hidden
              flex-shrink-0
              px-3
              sm:px-0
              py-2
            "
          >
            <Link
              href="/messages"
              className="
                inline-flex
                items-center
                gap-1.5
                text-zrp-red
                hover:underline
                text-sm
                font-medium
                min-h-[40px]
              "
            >
              <ArrowLeft className="w-4 h-4" />
              {t("chat.backToMessages")}
            </Link>
          </div>

          {/* Chat container */}
          <div
            className="
              flex-1
              min-h-0
              w-full
              overflow-hidden
            "
          >
            <ChatInterface
              receiverId={receiver.id}
              receiverName={
                receiver.name ||
                receiver.username
              }
              receiverUsername={
                receiver.username
              }
              receiverAvatar={
                receiver.avatarUrl
              }
              receiverBadgeType={
                receiver.badgeType
              }
              onVoiceCall={() =>
                startCall(false)
              }
              onVideoCall={() =>
                startCall(true)
              }
            />
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 w-full overflow-hidden">
          <CallComponent
            isIncoming={
              callState === "incoming"
            }
            callerName={
              callerName ||
              receiver.name
            }
            isVideo={isVideoCall}
            onAccept={acceptCall}
            onReject={rejectCall}
            onEnd={endCall}
            localStream={localStream}
            remoteStream={remoteStream}
          />
        </div>
      )}
    </main>
  );
}
