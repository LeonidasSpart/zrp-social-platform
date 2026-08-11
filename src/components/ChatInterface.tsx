"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getSocket } from "@/lib/socket-client";
import {
  Send, Phone, Video, Image, Smile, X, Download, ZoomIn, Trash2,
  Loader2, Reply, Pencil, Check,
} from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";

const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

interface ReactionUser {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
}

interface Reaction {
  id: string;
  emoji: string;
  user: ReactionUser;
}

interface MessageAuthor {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  badgeType?: string | null;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  read: boolean;
  imageUrl?: string | null;
  edited?: boolean;
  replyTo?: {
    id: string;
    content: string;
    imageUrl?: string | null;
    sender: MessageAuthor;
  } | null;
  reactions?: Reaction[];
}

interface ChatInterfaceProps {
  receiverId: string;
  receiverName: string;
  receiverUsername: string;
  receiverAvatar?: string;
  receiverBadgeType?: string | null;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatInterface({
  receiverId,
  receiverName,
  receiverUsername,
  receiverAvatar,
  receiverBadgeType,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Reply state ────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // ─── Edit state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Reaction picker state ──────────────────────────────────────────
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

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
          socketRef.current.off("message-edited");
          socketRef.current.off("reaction-updated");
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

    socket.on("message-edited", ({ message }: { message: Message }) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    });

    socket.on("reaction-updated", ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });
  };

  const sendMessage = async (content: string, imageUrl: string | null) => {
    if (!content.trim() && !imageUrl) return;

    setSending(true);

    const replyToSnapshot = replyingTo;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      content: content || "",
      senderId: userId!,
      receiverId,
      createdAt: new Date().toISOString(),
      read: false,
      imageUrl,
      replyTo: replyToSnapshot
        ? {
            id: replyToSnapshot.id,
            content: replyToSnapshot.content,
            imageUrl: replyToSnapshot.imageUrl,
            sender: {
              id: replyToSnapshot.senderId,
              username: replyToSnapshot.senderId === userId ? session?.user?.username || "" : receiverUsername,
              name: replyToSnapshot.senderId === userId ? session?.user?.name || "" : receiverName,
            },
          }
        : null,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId,
          content: content || "",
          imageUrl,
          replyToId: replyToSnapshot?.id || null,
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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !userId) return;
    await sendMessage(newMessage.trim(), null);
  };

  // ─── Delete Message ──────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm(t("chat.deleteMessageConfirm"))) return;

    setDeletingMessageId(messageId);
    try {
      const res = await fetch(`/api/messages/delete/${messageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
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

  // ─── Edit Message ────────────────────────────────────────────────────
  const startEdit = (message: Message) => {
    setEditingId(message.id);
    setEditContent(message.content);
    setReplyingTo(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/messages/edit/${messageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
        socketRef.current?.emit("edit-message", {
          message: updated,
          senderId: updated.senderId,
          receiverId: updated.receiverId,
        });
        setEditingId(null);
        setEditContent("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to edit message");
      }
    } catch (error) {
      console.error("Edit message error:", error);
      alert("Failed to edit message");
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Reactions ──────────────────────────────────────────────────────
  const handleReact = async (messageId: string, emoji: string) => {
    setReactionPickerFor(null);
    try {
      const res = await fetch(`/api/messages/reaction/${messageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
        );
        const message = messages.find((m) => m.id === messageId);
        if (message) {
          socketRef.current?.emit("message-reaction", {
            messageId,
            reactions: data.reactions,
            senderId: message.senderId,
            receiverId: message.receiverId,
          });
        }
      }
    } catch (error) {
      console.error("Reaction error:", error);
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

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;

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

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-zrp-red");
      setTimeout(() => el.classList.remove("ring-2", "ring-zrp-red"), 1200);
    }
  };

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages]);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  // ─── Group reactions by emoji, with counts ──────────────────────────
  const groupReactions = (reactions?: Reaction[]) => {
    if (!reactions || reactions.length === 0) return [];
    const map = new Map<string, ReactionUser[]>();
    reactions.forEach((r) => {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.user);
    });
    return Array.from(map.entries()).map(([emoji, users]) => ({ emoji, users }));
  };

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
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold flex-shrink-0">
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
            <p className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base hover:underline flex items-center gap-1">
              <span className="truncate">{receiverName}</span>
              <VerifiedBadge badgeType={receiverBadgeType} />
            </p>
            {receiverTyping && <p className="text-xs text-zrp-red">{t("chat.typing")}</p>}
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
            const isEditing = editingId === message.id;
            const reactionGroups = groupReactions(message.reactions);

            return (
              <div
                id={`msg-${message.id}`}
                key={message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"} transition rounded-2xl`}
              >
                <div className="max-w-[80%] sm:max-w-[75%]">
                  <div
                    className={`relative group rounded-2xl px-3 sm:px-4 py-2 break-words ${
                      isOwn
                        ? "bg-zrp-red text-white rounded-br-none"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none"
                    }`}
                  >
                    {/* ─── Hover action bar ─────────────────────────── */}
                    <div
                      className={`absolute -top-3 ${isOwn ? "left-0 -translate-x-1" : "right-0 translate-x-1"} opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-full shadow border border-gray-200 dark:border-gray-600 px-1 py-0.5 z-10`}
                    >
                      <button
                        onClick={() => setReactionPickerFor(reactionPickerFor === message.id ? null : message.id)}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        title="React"
                      >
                        <Smile className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
                      </button>
                      <button
                        onClick={() => setReplyingTo(message)}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
                      </button>
                      {isOwn && !message.imageUrl && (
                        <button
                          onClick={() => startEdit(message)}
                          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
                        </button>
                      )}
                      {isOwn && (
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          disabled={deletingMessageId === message.id}
                          className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                          title={t("chat.deleteMessage")}
                        >
                          {deletingMessageId === message.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300 hover:text-red-600" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* ─── Quick reaction picker ─────────────────────── */}
                    {reactionPickerFor === message.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setReactionPickerFor(null)} />
                        <div
                          className={`absolute -top-11 ${isOwn ? "right-0" : "left-0"} z-20 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 px-2 py-1.5`}
                        >
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleReact(message.id, emoji)}
                              className="text-lg hover:scale-125 transition-transform"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* ─── Quoted reply preview ──────────────────────── */}
                    {message.replyTo && (
                      <button
                        onClick={() => scrollToMessage(message.replyTo!.id)}
                        className={`block w-full text-left mb-1.5 px-2 py-1 rounded-lg border-l-2 text-xs ${
                          isOwn
                            ? "bg-white/10 border-white/40 text-white/80"
                            : "bg-black/5 dark:bg-white/5 border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        <p className="font-semibold truncate">
                          {message.replyTo.sender.id === userId ? "You" : message.replyTo.sender.name}
                        </p>
                        <p className="truncate opacity-90">
                          {message.replyTo.content || (message.replyTo.imageUrl ? "📷 Image" : "")}
                        </p>
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

                    {isEditing ? (
                      <div className="flex items-end gap-2 min-w-[180px]">
                        <textarea
                          value={editContent}
                          onChange={(e) => {
                            setEditContent(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              saveEdit(message.id);
                            }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          rows={1}
                          autoFocus
                          className="flex-1 min-w-0 bg-white/20 text-inherit placeholder-white/60 rounded-lg px-2 py-1 text-sm resize-none overflow-hidden max-h-32 focus:outline-none"
                        />
                        <button
                          onClick={() => saveEdit(message.id)}
                          disabled={savingEdit || !editContent.trim()}
                          className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 disabled:opacity-50"
                        >
                          {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-shrink-0 p-1 rounded-full hover:bg-white/20"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      displayContent && <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                    )}

                    <p
                      className={`text-[10px] mt-1 flex items-center gap-1 ${
                        isOwn ? "text-red-100" : "text-gray-400"
                      }`}
                    >
                      {new Date(message.createdAt).toLocaleTimeString(localeMap[language] || "en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {message.edited && <span>· edited</span>}
                      {isOwn && message.read && <span className="ml-1">✓✓</span>}
                    </p>
                  </div>

                  {/* ─── Reaction pills below the bubble ─────────────── */}
                  {reactionGroups.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                      {reactionGroups.map((group) => {
                        const reacted = group.users.some((u) => u.id === userId);
                        return (
                          <button
                            key={group.emoji}
                            onClick={() => handleReact(message.id, group.emoji)}
                            title={group.users.map((u) => u.name || u.username).join(", ")}
                            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition ${
                              reacted
                                ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                                : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            <span>{group.emoji}</span>
                            {group.users.length > 1 && <span>{group.users.length}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Reply preview above input ──────────────────────────────── */}
      {replyingTo && (
        <div className="px-3 sm:px-4 pt-2 flex items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-xs text-gray-500 dark:text-gray-400">
            <Reply className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              Replying to{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {replyingTo.senderId === userId ? "yourself" : receiverName}
              </span>
              : {replyingTo.content || (replyingTo.imageUrl ? "📷 Image" : "")}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── INPUT ────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSend}
        className="p-2 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex gap-1 sm:gap-2 items-end flex-shrink-0"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="text-gray-500 hover:text-zrp-red transition flex-shrink-0 disabled:opacity-50 p-1.5"
          title={t("chat.uploadImage")}
        >
          {uploadingImage ? (
            <div className="w-5 h-5 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
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
          className="text-gray-500 hover:text-zrp-red transition flex-shrink-0 p-1.5"
          title={t("chat.addEmoji")}
        >
          <Smile className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={newMessage}
          onChange={handleTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t("chat.messagePlaceholder", { name: receiverName })}
          rows={1}
          className="flex-1 min-w-0 px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none overflow-hidden max-h-32"
        />

        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-zrp-red text-white p-2 rounded-full hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
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
              className="absolute bottom-4 right-4 text-white bg-zrp-red rounded-full p-3 hover:bg-zrp-darkRed transition shadow-lg"
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
