"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from "lucide-react";

interface CallComponentProps {
  isIncoming?: boolean;
  callerName?: string;
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
}

export default function CallComponent({
  isIncoming = false,
  callerName,
  isVideo,
  onAccept,
  onReject,
  onEnd,
  localStream,
  remoteStream,
}: CallComponentProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(isVideo);
  const [callDuration, setCallDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // ─── Set video streams ──────────────────────────────────────────
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
    }
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      setIsConnecting(false);
    }
  }, [localStream, remoteStream]);

  // ─── Call duration timer ──────────────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isIncoming && remoteStream) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isIncoming, remoteStream]);

  // ─── Cleanup streams on unmount ──────────────────────────────
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
  };

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn);
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOn;
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ─── Determine what to display ─────────────────────────────────
  const showRemoteVideo = remoteStream && isVideo;
  const showLocalVideo = localStream && isVideoOn && isVideo;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
      <div className="relative w-full max-w-4xl p-4">
        {/* ─── Remote video ──────────────────────────────────────── */}
        <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video">
          {showRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white text-2xl">
              {isIncoming ? (
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-blue-600/30 flex items-center justify-center mx-auto mb-4 text-6xl">
                    📞
                  </div>
                  <p className="text-xl font-semibold">{callerName || "Someone"} is calling...</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {isVideo ? "Video call" : "Voice call"}
                  </p>
                </div>
              ) : isConnecting ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Connecting...</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-400">No video</p>
                  <p className="text-sm text-gray-500">Camera is off</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Local video (picture-in-picture) ──────────────────── */}
          {showLocalVideo && (
            <div className="absolute bottom-4 right-4 w-32 h-24 bg-black rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        {/* ─── Call info ──────────────────────────────────────────── */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-center">
          <p className="text-lg font-semibold">{callerName || "Call"}</p>
          {!isIncoming && remoteStream && (
            <p className="text-sm text-gray-300">{formatDuration(callDuration)}</p>
          )}
          {isIncoming && <p className="text-sm text-gray-300">Incoming call...</p>}
          {!isIncoming && !remoteStream && (
            <p className="text-sm text-gray-400">Ringing...</p>
          )}
        </div>

        {/* ─── Controls ────────────────────────────────────────────── */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
          {!isIncoming && remoteStream && (
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition ${
                  isMuted
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {isVideo && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition ${
                    !isVideoOn
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-white"
                  }`}
                >
                  {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              )}
            </>
          )}

          {/* ─── Accept / End / Reject buttons ────────────────────── */}
          <button
            onClick={isIncoming ? onAccept : onEnd}
            className={`p-6 rounded-full transition ${
              isIncoming
                ? "bg-green-500 hover:bg-green-600 text-white animate-pulse"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {isIncoming ? <Phone className="w-8 h-8" /> : <PhoneOff className="w-8 h-8" />}
          </button>

          {isIncoming && (
            <button
              onClick={onReject}
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* ─── End call button (when active) ──────────────────────── */}
        {!isIncoming && remoteStream && (
          <button
            onClick={onEnd}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 text-red-400 text-sm hover:text-red-300 transition bg-red-500/10 px-4 py-1.5 rounded-full"
          >
            End Call
          </button>
        )}
      </div>
    </div>
  );
}
