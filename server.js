const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/api/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    // ─── Join Room (for messaging) ──────────────────────────────
    socket.on("join-room", (userId) => {
      socket.join(userId);
      console.log(`✅ User ${userId} joined room (socket ${socket.id})`);
    });

    // ─── Messaging ──────────────────────────────────────────────
    socket.on("send-message", async ({ senderId, receiverId, content, messageId }) => {
      console.log(`💬 Message from ${senderId} to ${receiverId}: ${content}`);
      const message = {
        id: messageId,
        senderId,
        receiverId,
        content,
        createdAt: new Date().toISOString(),
        read: false,
      };
      io.to(receiverId).emit("receive-message", message);
      io.to(senderId).emit("message-sent", message);
    });

    socket.on("typing", ({ receiverId, isTyping }) => {
      socket.to(receiverId).emit("user-typing", { userId: socket.data.userId, isTyping });
    });

    socket.on("mark-read", async ({ messageId, senderId }) => {
      await prisma.message.update({ where: { id: messageId }, data: { read: true } });
      io.to(senderId).emit("message-read", { messageId });
    });

    // ─── Call Signaling (using socket IDs) ────────────────────────
    socket.on("call-user", ({ receiverId, signal, callerName, isVideo }) => {
      console.log(`📞 call-user from ${socket.id} to user ${receiverId}`);
      // Forward the incoming call to the receiver's user room, but include the caller's socket ID
      io.to(receiverId).emit("incoming-call", {
        from: socket.id,          // caller's socket ID
        callerName,
        signal,
        isVideo,
      });
    });

    // ─── Accept call: target is a socket ID ──────────────────────
    socket.on("accept-call", ({ targetSocketId, signal }) => {
      console.log(`✅ accept-call from ${socket.id} to socket ${targetSocketId}`);
      io.to(targetSocketId).emit("call-accepted", { signal });
    });

    socket.on("reject-call", ({ targetSocketId }) => {
      console.log(`❌ reject-call from ${socket.id} to socket ${targetSocketId}`);
      io.to(targetSocketId).emit("call-rejected");
    });

    socket.on("end-call", ({ targetSocketId }) => {
      console.log(`🔚 end-call from ${socket.id} to socket ${targetSocketId}`);
      io.to(targetSocketId).emit("call-ended");
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
