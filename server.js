const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { getToken } = require("next-auth/jwt");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// ─── Track online users ──────────────────────────────────────────────
const userStatus = new Map(); // userId -> true (online)

// ─── Allowed origins for the socket server ───────────────────────────
// Previously this was `origin: "*"`, which combined with zero handshake
// auth meant literally any page on the internet could open a socket and
// join any room. Origin alone was never going to fix the identity
// spoofing (see auth middleware below), but there's no reason to leave
// it wide open either. Set SOCKET_ALLOWED_ORIGINS as a comma-separated
// list on Railway if the Capacitor iOS/Android app needs an extra entry
// (e.g. "capacitor://localhost,http://localhost") - falls back to
// NEXTAUTH_URL alone if unset.
const allowedOrigins = (process.env.SOCKET_ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/api/socket.io",
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // ─── Handshake authentication ────────────────────────────────────
  // Previously every event handler below trusted whatever userId /
  // senderId / callerId the client sent in the payload - meaning any
  // visitor could `join-room` as someone else's userId and read their
  // DMs/calls in real time, or spoof a senderId so a victim's chat UI
  // showed a message "from" someone it didn't come from.
  //
  // This verifies the NextAuth session JWT (same cookie the Next.js
  // app itself trusts) on connect, and stores the *verified* userId on
  // socket.data. Every handler below now uses socket.data.userId for
  // anything identity-related instead of trusting the payload.
  io.use(async (socket, next) => {
    try {
      const token = await getToken({
        req: socket.request,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: !dev,
      });

      if (!token?.id) {
        return next(new Error("Unauthorized"));
      }

      if (token.banned) {
        return next(new Error("Account banned"));
      }

      socket.data.userId = String(token.id);
      next();
    } catch (err) {
      console.error("Socket auth error:", err);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`🔌 Socket connected: ${socket.id} (user ${userId})`);

    // ─── Join own room automatically ───────────────────────────────
    // No longer accepts a client-supplied userId - the room a socket
    // joins is exactly the verified identity from the handshake, so
    // there's no way to subscribe to someone else's room.
    socket.join(userId);
    userStatus.set(userId, true);
    socket.broadcast.emit("user-status", { userId, status: "online" });

    // Kept as a no-op-compatible listener so existing clients that
    // still emit "join-room" on connect (see socket-client.ts) don't
    // error out - it just re-confirms the same verified room instead
    // of trusting whatever id the client passes.
    socket.on("join-room", () => {
      socket.join(userId);
    });

    // ─── Request status for a specific user ──────────────────────
    socket.on("get-status", (targetUserId) => {
      const isOnline = userStatus.get(targetUserId) === true;
      socket.emit("user-status", { userId: targetUserId, status: isOnline ? "online" : "offline" });
    });

    // ─── Messaging ──────────────────────────────────────────────
    // senderId is now always the verified identity, never trusted
    // from the payload - a client can no longer make a message appear
    // to come from anyone but themselves.
    socket.on("send-message", async ({ receiverId, content, messageId }) => {
      if (!receiverId || typeof receiverId !== "string") return;

      const message = {
        id: messageId,
        senderId: userId,
        receiverId,
        content,
        createdAt: new Date().toISOString(),
        read: false,
      };
      io.to(receiverId).emit("receive-message", message);
      io.to(userId).emit("message-sent", message);
    });

    socket.on("typing", ({ receiverId, isTyping }) => {
      if (!receiverId || typeof receiverId !== "string") return;
      socket.to(receiverId).emit("user-typing", { userId, isTyping });
    });

    // ─── Delete / edit / reaction relay ──────────────────────────
    // Added because the client now emits these three events (real-time
    // sync for deleting/editing a message and toggling a reaction) but
    // nothing here was listening for them - the REST calls that
    // actually perform the delete/edit/reaction already succeeded by
    // the time these fire, so this is purely relaying the UI update to
    // the other participant, the same trust level send-message already
    // uses for receiverId (routing target, not an identity claim).
    socket.on("delete-message", ({ messageId, receiverId }) => {
      if (!messageId || !receiverId || typeof receiverId !== "string") return;
      io.to(receiverId).emit("message-deleted", { messageId });
    });

    socket.on("edit-message", ({ message, receiverId }) => {
      if (!message || !receiverId || typeof receiverId !== "string") return;
      io.to(receiverId).emit("message-edited", { message });
    });

    socket.on("message-reaction", ({ messageId, reactions, receiverId }) => {
      if (!messageId || !receiverId || typeof receiverId !== "string") return;
      io.to(receiverId).emit("reaction-updated", { messageId, reactions });
    });

    socket.on("mark-read", async ({ messageId }) => {
      if (!messageId) return;
      try {
        // Only the actual receiver of a message may mark it read -
        // previously any connected client could flip read=true on any
        // messageId it guessed or observed.
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { receiverId: true, senderId: true },
        });
        if (!message || message.receiverId !== userId) return;

        await prisma.message.update({ where: { id: messageId }, data: { read: true } });
        io.to(message.senderId).emit("message-read", { messageId });
      } catch (err) {
        console.error("mark-read error:", err);
      }
    });

    // ─── Call Signaling ──────────────────────────────────────────
    // callerId is now always the verified identity - a client can no
    // longer place a call that appears to originate from another user.
    socket.on("call-user", ({ receiverId, signal, callerName, isVideo }) => {
      if (!receiverId || typeof receiverId !== "string") return;
      console.log(`📞 call-user from ${userId} to ${receiverId}`);
      io.to(receiverId).emit("incoming-call", {
        callerId: userId,
        callerName,
        signal,
        isVideo,
      });
    });

    socket.on("accept-call", ({ callerId, signal }) => {
      if (!callerId || typeof callerId !== "string") return;
      console.log(`✅ accept-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-accepted", { signal });
    });

    socket.on("reject-call", ({ callerId }) => {
      if (!callerId || typeof callerId !== "string") return;
      console.log(`❌ reject-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-rejected");
    });

    socket.on("end-call", ({ callerId }) => {
      if (!callerId || typeof callerId !== "string") return;
      console.log(`🔚 end-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-ended");
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on("disconnect", () => {
      userStatus.delete(userId);
      socket.broadcast.emit("user-status", { userId, status: "offline" });
      console.log(`🔌 User ${userId} disconnected (socket ${socket.id})`);
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
