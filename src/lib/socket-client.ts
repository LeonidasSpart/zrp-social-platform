import { io, Socket } from "socket.io-client";
import {
  reconnectDelayMs,
  shouldReconnectAfterDisconnect,
  shouldRetryHandshake,
} from "./presence-client";

let socket: Socket | null = null;
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(current: Socket) {
  if (retryTimer) return;
  const delay = reconnectDelayMs(retryAttempt);
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (socket === current && !current.connected) {
      current.connect();
    }
  }, delay);
}

export function getSocket(userId: string): Socket {
  if (!socket) {
    socket = io({
      path: "/api/socket.io",
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected");
      retryAttempt = 0;
      socket?.emit("join-room", userId);
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected", reason);
      // socket.io reconnects on its own for every reason except a
      // server-initiated close; see presence-client.ts.
      if (socket && shouldReconnectAfterDisconnect(reason)) {
        scheduleReconnect(socket);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket error:", err);
      // A handshake refused by the server's auth middleware is NOT
      // retried by socket.io (socket.active is false). Retry it here
      // with backoff so a transient refusal never leaves this user
      // "Offline" for everyone for the rest of the page lifetime.
      if (socket && shouldRetryHandshake(err?.message, socket.active)) {
        scheduleReconnect(socket);
      }
    });
  }

  if (socket.connected) {
    socket.emit("join-room", userId);
  }

  return socket;
}

export function disconnectSocket() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
