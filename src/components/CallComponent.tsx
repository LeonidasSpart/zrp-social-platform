"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isIncoming) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isIncoming]);

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

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="relative w-full max-w-4xl p-4">
        {/* Remote video */}
        <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          {remoteStream ? (
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
                  <p className="text-4xl mb-4">📞</p>
                  <p>{callerName || "Someone"} is calling...</p>
                  <p className="text-sm text-gray-400">Video call</p>
                </div>
              ) : (
                <p>Connecting...</p>
              )}
            </div>
          )}

          {/* Local video (picture-in-picture) */}
          {isVideo && localStream && (
            <div className="absolute bottom-4 right-4 w-32 h-24 bg-black rounded-lg overflow-hidden border-2 border-white">
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

        {/* Call info */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-center">
          <p className="font-semibold">{callerName || "Call"}</p>
          {!isIncoming && <p className="text-sm text-gray-300">{formatDuration(callDuration)}</p>}
          {isIncoming && <p className="text-sm text-gray-300">Incoming call...</p>}
        </div>

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
          {!isIncoming && (
            <>
              <button
                onClick={toggleMute}
                className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition"
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <button
                onClick={toggleVideo}
                className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition"
              >
                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </button>
            </>
          )}
          <button
            onClick={isIncoming ? onAccept : onEnd}
            className={`p-6 rounded-full ${
              isIncoming
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            } transition`}
          >
            {isIncoming ? <Phone className="w-8 h-8" /> : <PhoneOff className="w-8 h-8" />}
          </button>
          {isIncoming && (
            <button
              onClick={onReject}
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
