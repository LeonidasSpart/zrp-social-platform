const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// ─── Track online users ──────────────────────────────────────────────
const userStatus = new Map(); // userId -> true (online)

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

    // ─── Join Room (userId) ────────────────────────────────────
    socket.on("join-room", (userId) => {
      socket.join(userId);
      socket.data.userId = userId; // store for disconnect
      console.log(`✅ User ${userId} joined room (socket ${socket.id})`);

      // ─── Set online and broadcast status ──────────────────────
      userStatus.set(userId, true);
      socket.broadcast.emit("user-status", { userId, status: "online" });
    });

    // ─── Request status for a specific user ──────────────────────
    socket.on("get-status", (userId) => {
      const isOnline = userStatus.has(userId) && userStatus.get(userId) === true;
      socket.emit("user-status", { userId, status: isOnline ? "online" : "offline" });
    });

    // ─── Messaging ──────────────────────────────────────────────
    socket.on("send-message", async ({ senderId, receiverId, content, messageId }) => {
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

    // ─── Call Signaling ──────────────────────────────────────────
    socket.on("call-user", ({ receiverId, signal, callerName, isVideo, callerId }) => {
      console.log(`📞 call-user from ${callerId} to ${receiverId}`);
      io.to(receiverId).emit("incoming-call", {
        callerId,
        callerName,
        signal,
        isVideo,
      });
    });

    socket.on("accept-call", ({ callerId, signal }) => {
      console.log(`✅ accept-call from ${socket.id} to ${callerId}`);
      io.to(callerId).emit("call-accepted", { signal });
    });

    socket.on("reject-call", ({ callerId }) => {
      console.log(`❌ reject-call from ${socket.id} to ${callerId}`);
      io.to(callerId).emit("call-rejected");
    });

    socket.on("end-call", ({ callerId }) => {
      console.log(`🔚 end-call from ${socket.id} to ${callerId}`);
      io.to(callerId).emit("call-ended");
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on("disconnect", () => {
      const userId = socket.data.userId;
      if (userId) {
        userStatus.delete(userId);
        socket.broadcast.emit("user-status", { userId, status: "offline" });
        console.log(`🔌 User ${userId} disconnected (socket ${socket.id})`);
      } else {
        console.log("🔌 Socket disconnected without userId:", socket.id);
      }
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
