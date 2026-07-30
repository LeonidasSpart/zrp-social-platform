import { Server as SocketServer } from "socket.io";
import { Server as HTTPServer } from "http";

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

      // Join user to their own room
      const userId = socket.handshake.auth.userId;
      if (userId) {
        socket.join(`user:${userId}`);
      }

      // Send message
      socket.on("send-message", async (data) => {
        const { receiverId, content, senderId } = data;

        // Save message to database
        const message = await saveMessageToDB({
          senderId,
          receiverId,
          content,
        });

        // Emit to receiver's room
        io?.to(`user:${receiverId}`).emit("receive-message", message);
        // Also emit back to sender for confirmation
        socket.emit("message-sent", message);
      });

      // Typing indicator
      socket.on("typing", ({ receiverId, isTyping }) => {
        io?.to(`user:${receiverId}`).emit("user-typing", {
          userId,
          isTyping,
        });
      });

      // Mark as read
      socket.on("mark-read", async ({ messageId, senderId }) => {
        await markMessagesAsRead(senderId, messageId);
        io?.to(`user:${senderId}`).emit("message-read", { messageId });
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  return io;
}
