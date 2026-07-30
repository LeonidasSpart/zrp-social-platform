"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import CallComponent from "@/components/CallComponent";
import { getMediaStream, createPeer } from "@/lib/call-service";

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
  const [peer, setPeer] = useState<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchReceiver();
    }
  }, [params.username, status]);

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

  // ─── Start Call ──────────────────────────────────────────────────
  const startCall = async (isVideo: boolean) => {
    try {
      const stream = await getMediaStream(isVideo);
      setLocalStream(stream);
      setIsVideoCall(isVideo);
      setCallState("calling");

      // TODO: Send call signal to receiver via socket.io
      // For now, simulate with a timeout
      setTimeout(() => {
        setCallState("active");
        // Simulate remote stream
        getMediaStream(isVideo).then((remote) => setRemoteStream(remote));
      }, 1500);
    } catch (error) {
      console.error("Error starting call:", error);
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await getMediaStream(isVideoCall);
      setLocalStream(stream);
      setCallState("active");
      // TODO: Send acceptance signal
      getMediaStream(isVideoCall).then((remote) => setRemoteStream(remote));
    } catch (error) {
      console.error("Error accepting call:", error);
    }
  };

  const rejectCall = () => {
    setCallState("idle");
    setLocalStream(null);
    setRemoteStream(null);
  };

  const endCall = () => {
    setCallState("idle");
    setLocalStream(null);
    setRemoteStream(null);
    if (peer) {
      peer.destroy();
      setPeer(null);
    }
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
