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
    console.log("Socket connected:", socket.id);

    // ─── Messaging ──────────────────────────────────────────────
    socket.on("join-room", (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined room`);
    });

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

    // ─── Call Signaling ───────────────────────────────────────────
    socket.on("call-user", ({ receiverId, signal, callerName, isVideo }) => {
      io.to(receiverId).emit("incoming-call", {
        from: socket.id,
        callerName,
        signal,
        isVideo,
      });
    });

    socket.on("accept-call", ({ receiverId, signal }) => {
      io.to(receiverId).emit("call-accepted", { signal });
    });

    socket.on("reject-call", ({ receiverId }) => {
      io.to(receiverId).emit("call-rejected");
    });

    socket.on("end-call", ({ receiverId }) => {
      io.to(receiverId).emit("call-ended");
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
