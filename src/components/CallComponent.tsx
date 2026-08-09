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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isIncoming && remoteStream) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isIncoming, remoteStream]);

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

  const showRemoteVideo = remoteStream && isVideo;
  const showLocalVideo = localStream && isVideoOn && isVideo;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
      <div className="relative w-full max-w-4xl p-4">
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
                  <div className="w-24 h-24 rounded-full bg-zrp-red/30 flex items-center justify-center mx-auto text-6xl animate-pulse">
                    📞
                  </div>
                </div>
              ) : isConnecting ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-zrp-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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

        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-center">
          <p className="text-lg font-semibold">{callerName || "Call"}</p>
          {!isIncoming && remoteStream && (
            <p className="text-sm text-gray-300">{formatDuration(callDuration)}</p>
          )}
          {isIncoming && (
            <p className="text-sm text-gray-300">
              Incoming {isVideo ? "video" : "voice"} call...
            </p>
          )}
          {!isIncoming && !remoteStream && (
            <p className="text-sm text-gray-400">Ringing...</p>
          )}
        </div>

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

          <button
            onClick={() => {
              if (isIncoming) {
                onAccept();
              } else {
                onEnd();
              }
            }}
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
