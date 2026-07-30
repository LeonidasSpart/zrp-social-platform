import io, { Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(userId: string) {
  if (!socket) {
    socket = io(process.env.NEXTAUTH_URL!, {
      path: "/api/socket",
      auth: { userId },
      transports: ["websocket"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
