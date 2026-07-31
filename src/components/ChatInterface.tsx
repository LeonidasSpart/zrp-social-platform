"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";
import { Send, Phone, Video, Image } from "lucide-react";

interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  read: boolean;
}

interface ChatInterfaceProps {
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatInterface({
  receiverId,
  receiverName,
  receiverAvatar,
  onVoiceCall,
  onVideoCall,
}: ChatInterfaceProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [receiverTyping, setReceiverTyping] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userId = session?.user?.id;

  // ─── Fetch messages ──────────────────────────────────────────────
  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${receiverId}`);
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  // ─── Socket Setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (userId) {
      const socket = getSocket(userId);
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("✅ Socket connected");
        setSocketConnected(true);
      });
      socket.on("disconnect", () => {
        console.log("❌ Socket disconnected");
        setSocketConnected(false);
      });
      socket.on("connect_error", (err) => {
        console.error("Socket error:", err);
        setSocketConnected(false);
      });

      setupSocketListeners();
      fetchMessages();

      // ─── POLLING FALLBACK (every 3 seconds) ──────────────────
      const interval = setInterval(() => {
        fetchMessages();
      }, 3000);

      return () => {
        clearInterval(interval);
        if (socketRef.current) {
          socketRef.current.off("receive-message");
          socketRef.current.off("user-typing");
          socketRef.current.off("message-read");
          socketRef.current.off("message-sent");
        }
      };
    }
  }, [userId, receiverId]);

  const setupSocketListeners = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("receive-message", (message: Message) => {
      if (message.senderId === receiverId) {
        setMessages((prev) => [...prev, message]);
        socket.emit("mark-read", { messageId: message.id, senderId: receiverId });
      }
    });

    socket.on("message-sent", (message: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? message : m))
      );
    });

    socket.on("user-typing", ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
      if (userId === receiverId) {
        setReceiverTyping(isTyping);
      }
    });

    socket.on("message-read", ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, read: true } : m))
      );
    });
  };

  // ─── Send message ──────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      content: newMessage,
      senderId: userId,
      receiverId,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId,
          content: newMessage.trim(),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send message");
      }

      const savedMessage = await res.json();

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m))
      );

      socketRef.current?.emit("send-message", {
        senderId: userId,
        receiverId,
        content: newMessage,
        messageId: savedMessage.id,
      });

    } catch (error: any) {
      console.error("Send error:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert(`Failed to send: ${error.message || "Unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit("typing", { receiverId, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit("typing", { receiverId, isTyping: false });
    }, 1000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading messages...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
            {receiverAvatar ? (
              <img src={receiverAvatar} alt={receiverName} className="w-full h-full rounded-full object-cover" />
            ) : (
              receiverName?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{receiverName}</p>
            {receiverTyping && <p className="text-xs text-blue-500">Typing...</p>}
          </div>
          <div className="flex items-center gap-1 ml-2">
            <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">{socketConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onVoiceCall}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={onVideoCall}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No messages yet</p>
            <p className="text-sm">Say hello to {receiverName}!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === userId;
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 break-words ${
                    isOwn
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className={`text-[10px] mt-1 ${isOwn ? "text-blue-200" : "text-gray-400"}`}>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {isOwn && message.read && <span className="ml-1">✓✓</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input ─── */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        <button
          type="button"
          className="text-gray-500 hover:text-blue-500 transition flex-shrink-0"
        >
          <Image className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder={`Message ${receiverName}...`}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-0"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
