"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getSocket } from "@/lib/socket-client";
import { Send, Phone, Video, Image, Smile, X, Download, ZoomIn, Trash2, Loader2 } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useLanguage } from "@/contexts/LanguageContext";

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
  receiverUsername: string;
  receiverAvatar?: string;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatInterface({
  receiverId,
  receiverName,
  receiverUsername,
  receiverAvatar,
  onVoiceCall,
  onVideoCall,
}: ChatInterfaceProps) {
  const { data: session } = useSession();
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [receiverTyping, setReceiverTyping] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageCountRef = useRef(0);

  const userId = session?.user?.id;

  // ─── Uploadthing hook for chat images ──────────────────────────────
  const { startUpload } = useUploadThing("chatImage", {
    onClientUploadComplete: (files) => {
      const url = files[0].ufsUrl;
      setUploadingImage(false);
      sendMessage("", url);
    },
    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

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
          socketRef.current.off("message-deleted");
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

    socket.on("message-deleted", ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
      alert(t("chat.errSendFailed", { error: error.message || "Unknown error" }));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    await sendMessage(newMessage.trim(), null);
  };

  // ─── Delete Message ──────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm(t("chat.deleteMessageConfirm"))) return;

    setDeletingMessageId(messageId);
    try {
      // ✅ FIXED: Use the nested /delete/[id] endpoint
      const res = await fetch(`/api/messages/delete/${messageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Remove from local state
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        // Emit socket event for real-time update
        const message = messages.find((m) => m.id === messageId);
        if (message) {
          socketRef.current?.emit("delete-message", {
            messageId,
            senderId: message.senderId,
            receiverId: message.receiverId,
          });
        }
      } else {
        const err = await res.json();
        alert(err.error || t("chat.errDeleteMessage"));
      }
    } catch (error) {
      console.error("Delete message error:", error);
      alert(t("chat.errDeleteMessage"));
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      return;
    }

    setUploadingImage(true);
    try {
      await startUpload([file]);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadingImage(false);
      alert(t("chat.errUploadFailedRetry"));
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
    if (messages.length > lastMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages]);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">{t("chat.loadingMessages")}</div>;
  }

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* ─── HEADER – CLICKABLE PROFILE LINK ───────────────────────── */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Link
          href={`/profile/${receiverUsername}`}
          className="flex items-center gap-2 sm:gap-3 min-w-0 hover:opacity-80 transition"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
            {receiverAvatar ? (
              <img
                src={receiverAvatar}
                alt={receiverName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              receiverName?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base hover:underline">
              {receiverName}
            </p>
            {receiverTyping && <p className="text-xs text-blue-500">{t("chat.typing")}</p>}
          </div>
          <div className="hidden sm:flex items-center gap-1 ml-2 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-gray-500">
              {socketConnected ? t("chat.live") : t("chat.offline")}
            </span>
          </div>
        </Link>
        <div className="flex gap-1 flex-shrink-0">
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

      {/* ─── MESSAGES ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>{t("chat.noMessagesYet")}</p>
            <p className="text-sm">{t("chat.sayHello", { name: receiverName })}</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === userId;
            const displayContent =
              message.content && message.content !== "📷 Image" ? message.content : "";

            return (
              <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative group max-w-[80%] sm:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2 break-words ${
                    isOwn
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none"
                  }`}
                >
                  {/* ─── DELETE BUTTON (only for sender) ────────────── */}
                  {isOwn && (
                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      disabled={deletingMessageId === message.id}
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition bg-gray-200 dark:bg-gray-700 rounded-full p-1 hover:bg-red-500 hover:text-white disabled:opacity-50"
                      title={t("chat.deleteMessage")}
                    >
                      {deletingMessageId === message.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  )}
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
                  <p
                    className={`text-[10px] mt-1 ${
                      isOwn ? "text-blue-200" : "text-gray-400"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString(localeMap[language] || "en-US", {
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

      {/* ─── INPUT ────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSend}
        className="p-2 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex gap-1 sm:gap-2 items-center flex-shrink-0"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="text-gray-500 hover:text-blue-500 transition flex-shrink-0 disabled:opacity-50 p-1.5"
          title={t("chat.uploadImage")}
        >
          {uploadingImage ? (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Image className="w-5 h-5" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="text-gray-500 hover:text-blue-500 transition flex-shrink-0 p-1.5"
          title={t("chat.addEmoji")}
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder={t("chat.messagePlaceholder", { name: receiverName })}
          className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-0"
        />

        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>

      {/* ─── Emoji picker ─── */}
      {showEmojiPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
          onClick={() => setShowEmojiPicker(false)}
        >
          <div
            className="w-full sm:w-auto max-h-[70vh] sm:max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-xl bg-white dark:bg-zrp-deepBlack shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              width="100%"
              height={380}
            />
          </div>
        </div>
      )}

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
              title={t("chat.downloadImage")}
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
