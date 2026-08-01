import Peer from "simple-peer";

export interface CallOptions {
  initiator: boolean;
  stream?: MediaStream;
  config?: RTCConfiguration;
}

export function createPeer(options: CallOptions) {
  return new Peer({
    initiator: options.initiator,
    stream: options.stream,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: "turn:YOUR_TURN_SERVER:3478",
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ],
      ...options.config,
    },
  });
}

export async function getMediaStream(hasVideo: boolean = true) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: hasVideo,
      audio: true,
    });
  } catch (error) {
    console.error("Error getting media stream:", error);
    throw error;
  }
}
