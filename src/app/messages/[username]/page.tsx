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

// Fallback if the TURN credential fetch fails — STUN-only, so calls
// between two open networks can still connect even without TURN relay.
const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function getIceServers(): Promise<any[]> {
  try {
    const res = await fetch("/api/turn-credentials");
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length > 0) {
      console.log("🧊 Using fetched TURN/STUN servers:", servers.length, "entries");
      return servers;
    }
    console.warn("🧊 TURN fetch returned empty/invalid, using fallback");
    return FALLBACK_ICE_SERVERS;
  } catch (err) {
    console.error("🧊 Failed to fetch TURN credentials, using fallback:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

export default function ChatPage(props: { params: Promise<{ username: string }> }) {
  const params = use(props.params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [receiver, setReceiver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "active">("idle");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [callerId, setCallerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peer, setPeer] = useState<Peer.Instance | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<any>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  // ─── Fill the exact space available below whatever's already rendered
  // above this page (sticky header, verification banner, etc.), instead
  // of guessing with a fixed h-screen - that was the actual bug causing
  // the message input to sit below the fold, requiring a page scroll to
  // reach it (Header is sticky, not fixed, so it still consumes real
  // document height; h-screen ignored that and always measured a full
  // 100vh starting from below the header, overflowing the true viewport).
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const top = containerRef.current.getBoundingClientRect().top;
        // visualViewport reflects the actual visible area on iOS Safari
        // when the on-screen keyboard is open - window.innerHeight alone
        // doesn't reliably shrink (or fire a resize event) when the
        // keyboard appears, which is exactly what let the input drift
        // out of view again once someone tapped into the message box.
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        setAvailableHeight(viewportHeight - top);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("scroll", updateHeight);
    // Re-measure shortly after mount too, in case a banner/header above
    // this page loads its real height asynchronously (e.g. session data).
    const timeoutId = setTimeout(updateHeight, 300);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("scroll", updateHeight);
      clearTimeout(timeoutId);
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && userId) {
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
      if (peer) peer.destroy();
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
    };
  }, [status, userId, params.username]);

  const fetchReceiver = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}`);
      const data = await res.json();
      setReceiver(data);
    } catch (error) {
      console.error("Error fetching receiver:", error);
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    if (!userId) return;
    const socket = getSocket(userId);
    socketRef.current = socket;

    socket.on("incoming-call", ({ callerId, signal, callerName, isVideo }) => {
      console.log("📞 Incoming call from", callerName);
      setCallerName(callerName);
      setCallerId(callerId);
      setIsVideoCall(isVideo);
      setIncomingSignal(signal);
      setCallState("incoming");
    });

    socket.on("call-accepted", ({ signal }) => {
      console.log("✅ Call accepted by receiver");
      if (peer) peer.signal(signal);
    });

    socket.on("call-rejected", () => {
      console.log("❌ Call rejected");
      endCall();
      setCallError(t("chat.callRejected"));
    });

    socket.on("call-ended", () => {
      console.log("🔚 Call ended by other party");
      endCall();
    });
  };

  const startCall = async (isVideo: boolean) => {
    setCallError(null);
    try {
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }),
        getIceServers(),
      ]);
      setLocalStream(stream);
      setIsVideoCall(isVideo);
      setCallState("calling");

      const newPeer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: { iceServers },
      });

      newPeer.on("signal", (signal) => {
        console.log("📡 Signal sent to", receiver.username);
        socketRef.current?.emit("call-user", {
          receiverId: receiver.id,
          signal,
          callerName: session?.user?.name || "User",
          isVideo,
          callerId: userId,
        });
      });

      newPeer.on("stream", (remoteStream) => {
        console.log("📡 Remote stream received");
        setRemoteStream(remoteStream);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => console.log("🧊 ICE state:", state));
      newPeer.on("connect", () => console.log("✅ Peer connected!"));
      newPeer.on("error", (err) => {
        console.error("❌ Peer error:", err);
        setCallError(t("chat.connectionError") + " " + (err?.message || String(err)));
        endCall();
      });

      setPeer(newPeer);
    } catch (error: any) {
      console.error("Error starting call:", error);
      setCallError(
        t("chat.micCameraError") + " " + (error?.name || "") + " " + (error?.message || String(error))
      );
      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    setCallError(null);
    try {
      console.log("🔵 Accepting call...");
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true }),
        getIceServers(),
      ]);
      setLocalStream(stream);

      const newPeer = new Peer({
        initiator: false,
        trickle: false,
        stream,
        config: { iceServers },
      });

      newPeer.on("signal", (signal) => {
        console.log("📡 Sending accept signal to callerId", callerId);
        if (callerId) {
          socketRef.current?.emit("accept-call", {
            callerId: callerId,
            signal,
          });
        } else {
          console.error("❌ No callerId to accept");
          setCallError(t("chat.missingCallerId"));
        }
      });

      newPeer.on("stream", (remoteStream) => {
        console.log("📡 Remote stream received (accept)");
        setRemoteStream(remoteStream);
        setCallState("active");
      });

      newPeer.on("iceStateChange", (state) => console.log("🧊 ICE state (accept):", state));
      newPeer.on("connect", () => console.log("✅ Peer connected (accept)!"));
      newPeer.on("error", (err) => {
        console.error("❌ Peer error (accept):", err);
        setCallError(t("chat.connectionError") + " " + (err?.message || String(err)));
        endCall();
      });

      if (incomingSignal) {
        console.log("📡 Signaling with incoming offer");
        newPeer.signal(incomingSignal);
      }

      setPeer(newPeer);
    } catch (error: any) {
      console.error("Error accepting call:", error);
      setCallError(
        t("chat.micCameraError") + " " + (error?.name || "") + " " + (error?.message || String(error))
      );
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (callerId) {
      socketRef.current?.emit("reject-call", { callerId });
    }
    setCallState("idle");
    setIncomingSignal(null);
  };

  const endCall = () => {
    if (peer) { peer.destroy(); setPeer(null); }
    if (localStream) { localStream.getTracks().forEach((t) => t.stop()); setLocalStream(null); }
    setRemoteStream(null);
    setCallState("idle");
    if (callerId) {
      socketRef.current?.emit("end-call", { callerId });
    }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">{t("action.loading")}</div></div>;
  }

  if (!receiver) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">{t("chat.userNotFound")}</p>
          <Link href="/messages" className="text-zrp-red hover:underline text-sm mt-2 block">← {t("chat.backToMessages")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full mx-auto px-2 sm:px-4 py-2 sm:py-4 flex flex-col overflow-hidden"
      style={{ height: availableHeight ? `${availableHeight}px` : "100vh" }}
    >
      {callError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-md text-center">
          {callError}
          <button
            onClick={() => setCallError(null)}
            className="ml-3 underline"
          >
            {t("chat.dismiss")}
          </button>
        </div>
      )}
      {callState === "idle" ? (
        <>
          {/* ─── Back link: mobile only — desktop uses the persistent sidebar ─── */}
          <div className="mb-2 sm:mb-4 lg:hidden">
            <Link href="/messages" className="text-zrp-red hover:underline text-sm flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              {t("chat.backToMessages")}
            </Link>
          </div>
          <div className="flex-1 min-h-0">
            <ChatInterface
              receiverId={receiver.id}
              receiverName={receiver.name || receiver.username}
              receiverUsername={receiver.username} // ✅ NEW
              receiverAvatar={receiver.avatarUrl}
              receiverBadgeType={receiver.badgeType}
              onVoiceCall={() => startCall(false)}
              onVideoCall={() => startCall(true)}
            />
          </div>
        </>
      ) : (
        <CallComponent
          isIncoming={callState === "incoming"}
          callerName={callerName || receiver.name}
          isVideo={isVideoCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          localStream={localStream}
          remoteStream={remoteStream}
        />
      )}
    </div>
  );
}
