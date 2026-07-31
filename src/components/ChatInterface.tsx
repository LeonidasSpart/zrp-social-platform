"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";
import { Send, Phone, Video, Image, Smile, X, Download, ZoomIn } from "lucide-react";
import EmojiPicker from "emoji-picker-react";

interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  read: boolean;
  imageUrl?: string | null;
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null); // for image preview
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = session?.user?.id;

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

  const sendMessage = async (content: string, imageUrl: string | null) => {
    if (!content.trim() && !imageUrl) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      content: content || "",
      senderId: userId!,
      receiverId,
      createdAt: new Date().toISOString(),
      read: false,
      imageUrl,
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId,
          content: content || "",
          imageUrl,
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
        content: content || "",
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    await sendMessage(newMessage.trim(), null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await sendMessage("", base64);
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadingImage(false);
      alert("Failed to upload image. Please try again.");
    }
    e.target.value = "";
  };

  const handleEmojiClick = (emoji: any) => {
    setNewMessage((prev) => prev + emoji.emoji);
    setShowEmojiPicker(false);
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

  const openLightbox = (imageUrl: string) => {
    setLightboxImage(imageUrl);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
  };

  const downloadImage = () => {
    if (lightboxImage) {
      const link = document.createElement('a');
      link.href = lightboxImage;
      link.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading messages...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
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
          <button onClick={onVoiceCall} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400">
            <Phone className="w-5 h-5" />
          </button>
          <button onClick={onVideoCall} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400">
            <Video className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No messages yet</p>
            <p className="text-sm">Say hello to {receiverName}!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === userId;
            const displayContent = message.content && message.content !== "📷 Image" ? message.content : "";

            return (
              <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 break-words ${
                  isOwn
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none"
                }`}>
                  {message.imageUrl && (
                    <div
                      className="cursor-pointer group relative"
                      onClick={() => openLightbox(message.imageUrl!)}
                    >
                      <img
                        src={message.imageUrl}
                        alt="Message attachment"
                        className="rounded-lg max-w-full max-h-60 object-contain"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30 rounded-lg">
                        <ZoomIn className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  )}
                  {displayContent && <p className="text-sm">{displayContent}</p>}
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

      <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 items-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="text-gray-500 hover:text-blue-500 transition flex-shrink-0 disabled:opacity-50"
          title="Upload image"
        >
          {uploadingImage ? (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Image className="w-5 h-5" />
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-gray-500 hover:text-blue-500 transition flex-shrink-0"
            title="Add emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full mb-2 right-0 z-50">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 z-10"
                >
                  <X className="w-4 h-4" />
                </button>
                <EmojiPicker onEmojiClick={handleEmojiClick} />
              </div>
            </div>
          )}
        </div>

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

      {/* ─── Lightbox Modal ─── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[999] p-4"
          onClick={closeLightbox}
        >
          <div
            className="relative max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="Full size"
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={closeLightbox}
              className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={downloadImage}
              className="absolute bottom-4 right-4 text-white bg-blue-600 rounded-full p-3 hover:bg-blue-700 transition shadow-lg"
              title="Download image"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
