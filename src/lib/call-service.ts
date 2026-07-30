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
