import { Server as SocketServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { prisma } from "./db";

let io: SocketServer | null = null;

// ─── Track online users ──────────────────────────────────────────────
const userConnections = new Map<string, number>(); // userId -> connection count

function setUserOnline(userId: string) {
  const count = userConnections.get(userId) || 0;
  userConnections.set(userId, count + 1);
  if (count === 0) {
    io?.emit("user-status", { userId, status: "online" });
  }
}

function setUserOffline(userId: string) {
  const count = userConnections.get(userId) || 0;
  if (count <= 1) {
    userConnections.delete(userId);
    io?.emit("user-status", { userId, status: "offline" });
  } else {
    userConnections.set(userId, count - 1);
  }
}

function isUserOnline(userId: string): boolean {
  return userConnections.has(userId) && userConnections.get(userId)! > 0;
}

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
        setUserOnline(userId);
        console.log(`✅ User ${userId} online (${userConnections.get(userId)} connections)`);
      }

      // ─── Request status for a specific user ──────────────────────
      socket.on("get-status", (targetUserId: string) => {
        const online = isUserOnline(targetUserId);
        socket.emit("user-status", { userId: targetUserId, status: online ? "online" : "offline" });
      });

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

      // ─── WebRTC Call Signaling ────────────────────────────────────
      socket.on("call-user", ({ receiverId, signal, callerName, isVideo }) => {
        io?.to(`user:${receiverId}`).emit("incoming-call", {
          from: userId,
          signal,
          callerName,
          isVideo,
        });
      });

      socket.on("accept-call", ({ receiverId, signal }) => {
        io?.to(`user:${receiverId}`).emit("call-accepted", { signal });
      });

      socket.on("reject-call", ({ receiverId }) => {
        io?.to(`user:${receiverId}`).emit("call-rejected");
      });

      socket.on("end-call", ({ receiverId }) => {
        io?.to(`user:${receiverId}`).emit("call-ended");
      });

      // ─── DELETE MESSAGE ────────────────────────────────────────────
      socket.on("delete-message", ({ messageId, senderId, receiverId }) => {
        io?.to(`user:${senderId}`).emit("message-deleted", { messageId });
        io?.to(`user:${receiverId}`).emit("message-deleted", { messageId });
      });

      // ─── Disconnect ──────────────────────────────────────────────
      socket.on("disconnect", () => {
        if (userId) {
          setUserOffline(userId);
          console.log(`🔌 User ${userId} offline (${userConnections.get(userId) || 0} connections)`);
        }
        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  return io;
}
