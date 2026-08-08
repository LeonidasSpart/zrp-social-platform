"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import CallComponent from "@/components/CallComponent";
import { getSocket } from "@/lib/socket-client";
import Peer from "simple-peer";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ChatPage({ params }: { params: { username: string } }) {
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

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:5349",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const startCall = async (isVideo: boolean) => {
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true,
      });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoCall,
        audio: true,
      });
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
    <div className="w-full max-w-full mx-auto px-2 sm:px-4 py-2 sm:py-4 h-screen flex flex-col overflow-hidden">
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
