import { io, Socket } from "socket.io-client";
import {
  reconnectDelayMs,
  shouldReconnectAfterDisconnect,
  shouldRetryHandshake,
} from "./presence-client";

let socket: Socket | null = null;
// Which userId the live `socket` connection's server-side handshake was
// actually verified for. Not just the last id someone asked for - see
// the identity check in getSocket() below for why the distinction
// matters.
let boundUserId: string | null = null;
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

function teardownSocket() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  boundUserId = null;
}

/**
 * ⚠️ SECURITY: this used to reuse the same live connection for whatever
 * userId was passed in, only re-emitting "join-room" with the new id.
 * The server never re-runs its auth handshake for an already-connected
 * socket, and "join-room" itself only ever re-confirms the room from
 * socket.data.userId (the identity verified at the ORIGINAL handshake,
 * from the session cookie at that time) - it ignores the client's
 * payload entirely (see server.js). So a socket created for User A
 * stayed authenticated, joined to A's room and attributed as A for
 * every relay, even after this function was later called with User B's
 * id: a logout followed by a different login in the same tab without a
 * full page reload, or NextAuth's own cross-tab session sync silently
 * updating `session.user.id` here while the tab never reloads, both
 * leave a live socket that is still B talking to A's room and A's
 * identity from the caller's point of view.
 *
 * Rather than rely on every caller remembering to disconnectSocket()
 * first, the identity check lives here: any call whose userId doesn't
 * match the connection's own verified identity tears it down and
 * starts fresh, forcing a real reconnect - which re-runs the server's
 * auth middleware against whatever session cookie is current now.
 */
export function getSocket(userId: string): Socket {
  if (socket && boundUserId !== null && boundUserId !== userId) {
    teardownSocket();
  }

  if (!socket) {
    boundUserId = userId;
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

  boundUserId = userId;
  if (socket.connected) {
    socket.emit("join-room", userId);
  }

  return socket;
}

export function disconnectSocket() {
  teardownSocket();
}
