import { Server as SocketServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { prisma } from "./db";

let io: SocketServer | null = null;

export function initSocketServer(server: HTTPServer) {
  if (!io) {
    io = new SocketServer(server, {
      cors: {
        origin: process.env.NEXTAUTH_URL,
        methods: ["GET", "POST"],
        credentials: true,
      },
      path: "/api/socket",
    });

    io.on("connection", (socket) => {
      console.log("Socket connected:", socket.id);

      const userId = socket.handshake.auth.userId;
      if (userId) {
        socket.join(`user:${userId}`);
      }

      // ─── Send message ──────────────────────────────────────────────
      socket.on("send-message", async (data) => {
        const { receiverId, content, senderId } = data;

        try {
          const message = await prisma.message.create({
            data: {
              content,
              senderId,
              receiverId,
              read: false,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatarUrl: true,
                },
              },
              receiver: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
          });

          io?.to(`user:${receiverId}`).emit("receive-message", message);
          socket.emit("message-sent", message);
        } catch (error) {
          console.error("Error saving message:", error);
          socket.emit("message-error", { error: "Failed to send message" });
        }
      });

      // ─── Typing indicator ──────────────────────────────────────────
      socket.on("typing", ({ receiverId, isTyping }) => {
        io?.to(`user:${receiverId}`).emit("user-typing", {
          userId,
          isTyping,
        });
      });

      // ─── Mark as read ─────────────────────────────────────────────
      socket.on("mark-read", async ({ messageId, senderId }) => {
        try {
          await prisma.message.updateMany({
            where: {
              id: messageId,
              senderId: senderId,
              receiverId: userId,
              read: false,
            },
            data: { read: true },
          });
          io?.to(`user:${senderId}`).emit("message-read", { messageId });
        } catch (error) {
          console.error("Error marking message as read:", error);
        }
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  return io;
}
