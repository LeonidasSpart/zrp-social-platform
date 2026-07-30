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

export default function ChatPage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [receiver, setReceiver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "active">("idle");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peer, setPeer] = useState<Peer.Instance | null>(null);
  const [incomingSignal, setIncomingSignal] = useState<any>(null);
  const socketRef = useRef<any>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
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
      if (peer) {
        peer.destroy();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
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

    socket.on("incoming-call", ({ from, signal, callerName, isVideo }) => {
      setCallerName(callerName);
      setIsVideoCall(isVideo);
      setIncomingSignal(signal);
      setCallState("incoming");
      // Store the caller ID for later use
      socketRef.current._callerId = from;
    });

    socket.on("call-accepted", ({ signal }) => {
      if (peer) {
        peer.signal(signal);
      }
    });

    socket.on("call-rejected", () => {
      endCall();
      alert("Call was rejected");
    });

    socket.on("call-ended", () => {
      endCall();
    });
  };

  // ─── Start Call ──────────────────────────────────────────────────
  const startCall = async (isVideo: boolean) => {
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
        stream: stream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      newPeer.on("signal", (signal) => {
        socketRef.current?.emit("call-user", {
          receiverId: receiver.id,
          signal,
          callerName: session?.user?.name || "User",
          isVideo,
        });
      });

      newPeer.on("stream", (remoteStream) => {
        setRemoteStream(remoteStream);
        setCallState("active");
      });

      newPeer.on("error", (err) => {
        console.error("Peer error:", err);
        endCall();
      });

      setPeer(newPeer);
    } catch (error) {
      console.error("Error starting call:", error);
      alert("Could not access camera/microphone. Please allow permissions.");
      setCallState("idle");
    }
  };

  // ─── Accept Incoming Call ──────────────────────────────────────
  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoCall,
        audio: true,
      });
      setLocalStream(stream);

      const newPeer = new Peer({
        initiator: false,
        stream: stream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      newPeer.on("signal", (signal) => {
        socketRef.current?.emit("accept-call", {
          receiverId: socketRef.current?._callerId,
          signal,
        });
      });

      newPeer.on("stream", (remoteStream) => {
        setRemoteStream(remoteStream);
        setCallState("active");
      });

      newPeer.on("error", (err) => {
        console.error("Peer error:", err);
        endCall();
      });

      // Signal with the incoming offer
      if (incomingSignal) {
        newPeer.signal(incomingSignal);
      }

      setPeer(newPeer);
    } catch (error) {
      console.error("Error accepting call:", error);
      alert("Could not access camera/microphone.");
      rejectCall();
    }
  };

  const rejectCall = () => {
    socketRef.current?.emit("reject-call", {
      receiverId: socketRef.current?._callerId || receiver?.id,
    });
    setCallState("idle");
    setIncomingSignal(null);
  };

  const endCall = () => {
    if (peer) {
      peer.destroy();
      setPeer(null);
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setCallState("idle");
    socketRef.current?.emit("end-call", {
      receiverId: receiver?.id || socketRef.current?._callerId,
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!receiver) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">User not found</p>
          <Link href="/messages" className="text-blue-600 hover:underline text-sm mt-2 block">
            ← Back to messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4 h-screen flex flex-col">
      {callState === "idle" ? (
        <>
          <div className="mb-4">
            <Link href="/messages" className="text-blue-600 hover:underline text-sm">
              ← Back to messages
            </Link>
          </div>
          <div className="flex-1">
            <ChatInterface
              receiverId={receiver.id}
              receiverName={receiver.name || receiver.username}
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
