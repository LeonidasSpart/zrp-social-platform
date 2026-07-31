import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(userId: string): Socket {
  if (!socket) {
    socket = io({
      path: "/api/socket.io",          // ✅ must match server path
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected");
      socket?.emit("join-room", userId);   // ✅ join room for this user
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket error:", err);
    });
  }

  // If socket is already connected but we haven't joined the room yet,
  // we should join when called. But for simplicity, we join on connect.
  // If the socket is already connected, we can just emit join-room.
  if (socket.connected) {
    socket.emit("join-room", userId);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
