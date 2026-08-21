"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";
import {
  Send,
  Phone,
  Video,
  Image,
  Smile,
  X,
  Download,
  ZoomIn,
  Trash2,
  Loader2,
  Reply,
  Pencil,
  Check,
  Paperclip,
  FileText,
  Mic,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import ChatContactDrawer from "@/components/ChatContactDrawer";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

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
  const { refreshUnreadMessageCount } = useUnreadCount();
  const { t, language } = useLanguage();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [receiverTyping, setReceiverTyping] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    new Set()
  );

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const lastMessageCountRef = useRef(0);
  const initialMessagesLoadedRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // Voice recording
  // ---------------------------------------------------------------------------

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recordingSecondsRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingCancelledRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Reply
  // ---------------------------------------------------------------------------

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(
    null
  );

  // ---------------------------------------------------------------------------
  // MOBILE MESSAGE ACTIONS
  //
  // On touch devices the action bar is hidden by default.
  // Tapping a message reveals actions only for that message.
  // ---------------------------------------------------------------------------

  const [activeMessageActions, setActiveMessageActions] = useState<
    string | null
  >(null);

  const userId = session?.user?.id;

  // ---------------------------------------------------------------------------
  // Upload image
  // ---------------------------------------------------------------------------

  const { startUpload } = useUploadThing("chatImage", {
    onClientUploadComplete: (files) => {
      if (!files?.length) {
        setUploadingImage(false);
        return;
      }

      const url = files[0].ufsUrl;

      setUploadingImage(false);
      sendMessage("", url);
    },

    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  // ---------------------------------------------------------------------------
  // Upload documents
  // ---------------------------------------------------------------------------

  const { startUpload: startFileUpload } = useUploadThing("chatFile", {
    onClientUploadComplete: (files) => {
      if (!files?.length) {
        setUploadingImage(false);
        return;
      }

      const url = files[0].ufsUrl;

      setUploadingImage(false);

      sendMessage(`📎 ${files[0].name}`, url);
    },

    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  // ---------------------------------------------------------------------------
  // Upload voice
  // ---------------------------------------------------------------------------

  const { startUpload: startAudioUpload } = useUploadThing("chatAudio", {
    onClientUploadComplete: (files) => {
      if (!files?.length) {
        setUploadingImage(false);
        return;
      }

      const url = files[0].ufsUrl;

      setUploadingImage(false);

      sendMessage(
        `🎤 Voice message (${formatRecordingTime(
          recordingSecondsRef.current
        )})`,
        url
      );

      recordingSecondsRef.current = 0;
    },

    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  // ---------------------------------------------------------------------------
  // Fetch messages
  // ---------------------------------------------------------------------------

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${receiverId}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await res.json();

      setMessages(Array.isArray(data) ? data : []);

      refreshUnreadMessageCount();
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Socket listeners
  // ---------------------------------------------------------------------------

  const setupSocketListeners = () => {
    const socket = socketRef.current;

    if (!socket) return;

    socket.on("receive-message", (message: Message) => {
      if (message.senderId !== receiverId) return;

      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }

        return [...prev, message];
      });

      socket.emit("mark-read", {
        messageId: message.id,
        senderId: receiverId,
      });

      refreshUnreadMessageCount();
    });

    socket.on("message-sent", (message: Message) => {
      setMessages((prev) =>
        prev.map((item) => (item.id === message.id ? message : item))
      );
    });

    socket.on(
      "user-typing",
      ({
        userId: typingUserId,
        isTyping: typing,
      }: {
        userId: string;
        isTyping: boolean;
      }) => {
        if (typingUserId === receiverId) {
          setReceiverTyping(typing);
        }
      }
    );

    socket.on("message-read", ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId ? { ...item, read: true } : item
        )
      );
    });

    socket.on("message-deleted", ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.filter((item) => item.id !== messageId)
      );

      setActiveMessageActions((current) =>
        current === messageId ? null : current
      );
    });

    socket.on(
      "message-edited",
      ({ message }: { message: Message }) => {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? message : item
          )
        );
      }
    );

    socket.on(
      "reaction-updated",
      ({
        messageId,
        reactions,
      }: {
        messageId: string;
        reactions: Reaction[];
      }) => {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === messageId
              ? { ...item, reactions }
              : item
          )
        );
      }
    );
  };

  // ---------------------------------------------------------------------------
  // Socket connection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!userId) return;

    const socket = getSocket(userId);

    socketRef.current = socket;

    const handleConnect = () => {
      console.log("✅ Socket connected");
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      console.log("❌ Socket disconnected");
      setSocketConnected(false);
    };

    const handleConnectError = (err: unknown) => {
      console.error("Socket error:", err);
      setSocketConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    setupSocketListeners();
    fetchMessages();

    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);

    return () => {
      clearInterval(interval);

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      socket.off("receive-message");
      socket.off("user-typing");
      socket.off("message-read");
      socket.off("message-sent");
      socket.off("message-deleted");
      socket.off("message-edited");
      socket.off("reaction-updated");
    };
  }, [userId, receiverId]);

  // ---------------------------------------------------------------------------
  // Cleanup recording
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      mediaStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Scroll behavior
  // ---------------------------------------------------------------------------

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior,
        block: "end",
      });
    });
  };

  useEffect(() => {
    if (!initialMessagesLoadedRef.current && messages.length > 0) {
      initialMessagesLoadedRef.current = true;
      lastMessageCountRef.current = messages.length;

      setTimeout(() => {
        scrollToBottom("auto");
      }, 50);

      return;
    }

    if (messages.length > lastMessageCountRef.current) {
      scrollToBottom("smooth");
    }

    lastMessageCountRef.current = messages.length;
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = async (
    content: string,
    imageUrl: string | null
  ) => {
    if (!content.trim() && !imageUrl) return;
    if (!userId) return;

    setSending(true);

    const replyToSnapshot = replyingTo;

    const tempId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    const optimisticMessage: Message = {
      id: tempId,
      content: content || "",
      senderId: userId,
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
              username:
                replyToSnapshot.senderId === userId
                  ? session?.user?.username || ""
                  : receiverUsername,
              name:
                replyToSnapshot.senderId === userId
                  ? session?.user?.name || ""
                  : receiverName,
            },
          }
        : null,

      reactions: [],
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    setNewMessage("");
    setReplyingTo(null);
    setActiveMessageActions(null);
    setReactionPickerFor(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiverId,
          content: content || "",
          imageUrl,
          replyToId: replyToSnapshot?.id || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);

        throw new Error(
          error?.error || "Failed to send message"
        );
      }

      const savedMessage = await res.json();

      setMessages((prev) =>
        prev.map((item) =>
          item.id === tempId ? savedMessage : item
        )
      );

      socketRef.current?.emit("send-message", {
        senderId: userId,
        receiverId,
        content: content || "",
        messageId: savedMessage.id,
      });
    } catch (error: any) {
      console.error("Send error:", error);

      setMessages((prev) =>
        prev.filter((item) => item.id !== tempId)
      );

      alert(
        t("chat.errSendFailed", {
          error: error?.message || "Unknown error",
        })
      );
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!newMessage.trim() || !userId) return;

    await sendMessage(newMessage.trim(), null);
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm(t("chat.deleteMessageConfirm"))) return;

    setDeletingMessageId(messageId);
    setActiveMessageActions(null);
    setReactionPickerFor(null);

    try {
      const res = await fetch(
        `/api/messages/delete/${messageId}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        const message = messages.find(
          (item) => item.id === messageId
        );

        setMessages((prev) =>
          prev.filter((item) => item.id !== messageId)
        );

        if (message) {
          socketRef.current?.emit("delete-message", {
            messageId,
            senderId: message.senderId,
            receiverId: message.receiverId,
          });
        }
      } else {
        const err = await res.json().catch(() => null);

        alert(
          err?.error || t("chat.errDeleteMessage")
        );
      }
    } catch (error) {
      console.error("Delete message error:", error);
      alert(t("chat.errDeleteMessage"));
    } finally {
      setDeletingMessageId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  const startEdit = (message: Message) => {
    setEditingId(message.id);
    setEditContent(message.content);
    setReplyingTo(null);
    setReactionPickerFor(null);
    setActiveMessageActions(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;

    setSavingEdit(true);

    try {
      const res = await fetch(
        `/api/messages/edit/${messageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: editContent.trim(),
          }),
        }
      );

      if (res.ok) {
        const updated = await res.json();

        setMessages((prev) =>
          prev.map((item) =>
            item.id === messageId ? updated : item
          )
        );

        socketRef.current?.emit("edit-message", {
          message: updated,
          senderId: updated.senderId,
          receiverId: updated.receiverId,
        });

        setEditingId(null);
        setEditContent("");
        setActiveMessageActions(null);
      } else {
        const err = await res.json().catch(() => null);

        alert(
          err?.error || "Failed to edit message"
        );
      }
    } catch (error) {
      console.error("Edit message error:", error);
      alert("Failed to edit message");
    } finally {
      setSavingEdit(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  const handleReact = async (
    messageId: string,
    emoji: string
  ) => {
    setReactionPickerFor(null);
    setActiveMessageActions(null);

    try {
      const res = await fetch(
        `/api/messages/reaction/${messageId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            emoji,
          }),
        }
      );

      if (!res.ok) return;

      const data = await res.json();

      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? {
                ...item,
                reactions: data.reactions,
              }
            : item
        )
      );

      const message = messages.find(
        (item) => item.id === messageId
      );

      if (message) {
        socketRef.current?.emit("message-reaction", {
          messageId,
          reactions: data.reactions,
          senderId: message.senderId,
          receiverId: message.receiverId,
        });
      }
    } catch (error) {
      console.error("Reaction error:", error);
    }
  };

  // ---------------------------------------------------------------------------
  // Image upload
  // ---------------------------------------------------------------------------

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      e.target.value = "";
      return;
    }

    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!validTypes.includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      e.target.value = "";
      return;
    }

    setUploadingImage(true);

    try {
      await startUpload([file]);
    } catch (error) {
      console.error("Upload error:", error);

      setUploadingImage(false);

      alert(t("chat.errUploadFailedRetry"));
    }

    e.target.value = "";
  };

  // ---------------------------------------------------------------------------
  // Document upload
  // ---------------------------------------------------------------------------

  const DOCUMENT_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];

  const handleDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      e.target.value = "";
      return;
    }

    if (!DOCUMENT_TYPES.includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      e.target.value = "";
      return;
    }

    setUploadingImage(true);

    try {
      await startFileUpload([file]);
    } catch (error) {
      console.error("Upload error:", error);

      setUploadingImage(false);

      alert(t("chat.errUploadFailedRetry"));
    }

    e.target.value = "";
  };

  // ---------------------------------------------------------------------------
  // Voice recording
  // ---------------------------------------------------------------------------

  const formatRecordingTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(t("chat.errMicAccess"));
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      mediaStreamRef.current = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType = mimeCandidates.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingCancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        mediaStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());

        mediaStreamRef.current = null;

        if (
          recordingCancelledRef.current ||
          audioChunksRef.current.length === 0
        ) {
          audioChunksRef.current = [];
          return;
        }

        const blob = new Blob(
          audioChunksRef.current,
          {
            type: mimeType || "audio/webm",
          }
        );

        audioChunksRef.current = [];

        const extension = mimeType?.includes("mp4")
          ? "m4a"
          : "webm";

        const file = new File(
          [blob],
          `voice-message.${extension}`,
          {
            type: blob.type,
          }
        );

        setUploadingImage(true);

        try {
          await startAudioUpload([file]);
        } catch (error) {
          console.error(
            "Voice message upload error:",
            error
          );

          setUploadingImage(false);

          alert(t("chat.errUploadFailedRetry"));
        }
      };

      recorder.start();

      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((previous) => {
          const next = previous + 1;

          recordingSecondsRef.current = next;

          return next;
        });
      }, 1000);
    } catch (error) {
      console.error(
        "Microphone access error:",
        error
      );

      alert(t("chat.errMicAccess"));
    }
  };

  const stopAndSendRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    recordingCancelledRef.current = false;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    recordingCancelledRef.current = true;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
  };

  // ---------------------------------------------------------------------------
  // Emoji
  // ---------------------------------------------------------------------------

  const handleEmojiClick = (emoji: any) => {
    const textarea = textareaRef.current;

    const start =
      textarea?.selectionStart ??
      newMessage.length;

    const end =
      textarea?.selectionEnd ??
      newMessage.length;

    const before = newMessage.slice(0, start);
    const after = newMessage.slice(end);

    const updated =
      before + emoji.emoji + after;

    setNewMessage(updated);
    setShowEmojiPicker(false);

    setTimeout(() => {
      if (!textareaRef.current) return;

      const newPosition =
        start + emoji.emoji.length;

      textareaRef.current.selectionStart =
        newPosition;

      textareaRef.current.selectionEnd =
        newPosition;

      textareaRef.current.style.height = "auto";

      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        128
      )}px`;

      textareaRef.current.focus();
    }, 0);
  };

  // ---------------------------------------------------------------------------
  // Typing
  // ---------------------------------------------------------------------------

  const handleTyping = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = e.target.value;

    setNewMessage(value);

    e.target.style.height = "auto";

    e.target.style.height = `${Math.min(
      e.target.scrollHeight,
      128
    )}px`;

    if (!isTyping) {
      setIsTyping(true);

      socketRef.current?.emit("typing", {
        receiverId,
        isTyping: true,
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);

      socketRef.current?.emit("typing", {
        receiverId,
        isTyping: false,
      });
    }, 1000);
  };

  // ---------------------------------------------------------------------------
  // Lightbox
  // ---------------------------------------------------------------------------

  const openLightbox = (imageUrl: string) => {
    setActiveMessageActions(null);
    setLightboxImage(imageUrl);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
  };

  const downloadImage = () => {
    if (!lightboxImage) return;

    const link = document.createElement("a");

    link.href = lightboxImage;
    link.download = `image-${Date.now()}.jpg`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
  };

  // ---------------------------------------------------------------------------
  // Reply navigation
  // ---------------------------------------------------------------------------

  const scrollToMessage = (messageId: string) => {
    setActiveMessageActions(null);

    const element = document.getElementById(
      `msg-${messageId}`
    );

    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    element.classList.add(
      "ring-2",
      "ring-zrp-red"
    );

    setTimeout(() => {
      element.classList.remove(
        "ring-2",
        "ring-zrp-red"
      );
    }, 1200);
  };

  // ---------------------------------------------------------------------------
  // Reactions grouping
  // ---------------------------------------------------------------------------

  const groupReactions = (
    reactions?: Reaction[]
  ) => {
    if (!reactions?.length) return [];

    const map = new Map<
      string,
      ReactionUser[]
    >();

    reactions.forEach((reaction) => {
      if (!map.has(reaction.emoji)) {
        map.set(reaction.emoji, []);
      }

      map
        .get(reaction.emoji)!
        .push(reaction.user);
    });

    return Array.from(map.entries()).map(
      ([emoji, users]) => ({
        emoji,
        users,
      })
    );
  };

  const localeMap: Record<string, string> = {
    en: "en-US",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center bg-white dark:bg-zrp-deepBlack">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("chat.loadingMessages")}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <div
      className="
        relative
        flex
        flex-col
        min-h-0
        h-full
        w-full
        max-w-full
        overflow-hidden
        bg-white
        dark:bg-zrp-deepBlack
        border
        border-gray-200
        dark:border-gray-700
        rounded-none
        sm:rounded-xl
        shadow-sm
      "
      style={{
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* =======================================================================
          HEADER
      ======================================================================= */}

      <header
        className="
          relative
          z-30
          flex
          min-h-[60px]
          shrink-0
          items-center
          justify-between
          gap-2
          border-b
          border-gray-200
          dark:border-gray-700
          bg-white
          dark:bg-zrp-deepBlack
          px-3
          py-2
          sm:min-h-[68px]
          sm:px-4
        "
      >
        <button
          type="button"
          onClick={() =>
            setShowContactInfo(true)
          }
          className="
            flex
            min-w-0
            flex-1
            items-center
            gap-2
            sm:gap-3
            text-left
            transition-opacity
            hover:opacity-80
            focus:outline-none
          "
        >
          <div
            className="
              flex
              h-9
              w-9
              shrink-0
              items-center
              justify-center
              overflow-hidden
              rounded-full
              bg-zrp-red/10
              font-semibold
              text-zrp-red
              sm:h-10
              sm:w-10
            "
          >
            {receiverAvatar ? (
              <img
                src={receiverAvatar}
                alt={receiverName}
                className="h-full w-full object-cover"
              />
            ) : (
              receiverName?.[0]?.toUpperCase() ||
              "?"
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <span
                className="
                  min-w-0
                  truncate
                  text-sm
                  font-semibold
                  text-gray-900
                  dark:text-white
                  sm:text-base
                "
              >
                {receiverName}
              </span>

              <VerifiedBadge
                badgeType={receiverBadgeType}
              />
            </div>

            {receiverTyping ? (
              <p className="text-xs font-medium text-zrp-red">
                {t("chat.typing")}
              </p>
            ) : (
              <div className="mt-0.5 hidden items-center gap-1 sm:flex">
                <span
                  className={`h-2 w-2 rounded-full ${
                    socketConnected
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                />

                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {socketConnected
                    ? t("chat.live")
                    : t("chat.offline")}
                </span>
              </div>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {onVoiceCall && (
            <button
              type="button"
              onClick={onVoiceCall}
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-zrp-red
                dark:text-gray-400
                dark:hover:bg-gray-700
              "
              aria-label="Voice call"
            >
              <Phone className="h-5 w-5" />
            </button>
          )}

          {onVideoCall && (
            <button
              type="button"
              onClick={onVideoCall}
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-zrp-red
                dark:text-gray-400
                dark:hover:bg-gray-700
              "
              aria-label="Video call"
            >
              <Video className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* =======================================================================
          CONTACT DRAWER
      ======================================================================= */}

      {showContactInfo && (
        <ChatContactDrawer
          receiverUsername={receiverUsername}
          receiverName={receiverName}
          receiverAvatar={receiverAvatar}
          receiverBadgeType={receiverBadgeType}
          messages={messages}
          onClose={() =>
            setShowContactInfo(false)
          }
          onVoiceCall={onVoiceCall}
          onVideoCall={onVideoCall}
        />
      )}

      {/* =======================================================================
          MESSAGES
      ======================================================================= */}

      <main
        ref={messagesContainerRef}
        className="
          relative
          z-0
          min-h-0
          flex-1
          overflow-x-hidden
          overflow-y-auto
          overscroll-contain
          px-2.5
          py-3
          sm:px-4
          sm:py-4
        "
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarGutter: "stable",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6">
            <div className="text-center">
              <div
                className="
                  mx-auto
                  mb-3
                  flex
                  h-14
                  w-14
                  items-center
                  justify-center
                  rounded-full
                  bg-zrp-red/10
                  text-xl
                  font-semibold
                  text-zrp-red
                "
              >
                {receiverName?.[0]?.toUpperCase() ||
                  "?"}
              </div>

              <p className="font-medium text-gray-500 dark:text-gray-400">
                {t("chat.noMessagesYet")}
              </p>

              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                {t("chat.sayHello", {
                  name: receiverName,
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            <div className="space-y-2 sm:space-y-2.5">
              {messages.map((message) => {
                const isOwn =
                  message.senderId === userId;

                const displayContent =
                  message.content &&
                  message.content !== "📷 Image"
                    ? message.content
                    : "";

                const isEditing =
                  editingId === message.id;

                const reactionGroups =
                  groupReactions(
                    message.reactions
                  );

                const isActive =
                  activeMessageActions ===
                  message.id;

                return (
                  <div
                    id={`msg-${message.id}`}
                    key={message.id}
                    onClick={() => {
                      setActiveMessageActions(
                        (current) =>
                          current === message.id
                            ? null
                            : message.id
                      );

                      if (
                        reactionPickerFor &&
                        reactionPickerFor !==
                          message.id
                      ) {
                        setReactionPickerFor(null);
                      }
                    }}
                    className={`
                      group/message
                      flex
                      w-full
                      cursor-pointer
                      ${
                        isOwn
                          ? "justify-end"
                          : "justify-start"
                      }
                      transition-all
                      duration-200
                    `}
                  >
                    <div
                      className={`
                        relative
                        min-w-0
                        max-w-[88%]
                        sm:max-w-[78%]
                        md:max-w-[72%]
                        lg:max-w-[68%]
                        ${
                          isOwn
                            ? "items-end"
                            : "items-start"
                        }
                      `}
                    >
                      {/* =====================================================
                          BUBBLE
                      ===================================================== */}

                      <div
                        className={`
                          relative
                          min-w-0
                          rounded-2xl
                          px-3
                          py-2
                          shadow-[0_1px_2px_rgba(0,0,0,0.06)]
                          sm:px-3.5
                          ${
                            isOwn
                              ? "rounded-br-md bg-zrp-red text-white"
                              : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
                          }
                        `}
                      >
                        {/* ===================================================
                            MESSAGE ACTIONS

                            Desktop:
                            Actions appear on hover.

                            Mobile/tablet:
                            Actions appear only after tapping that message.
                        =================================================== */}

                        {isActive && (
                          <div
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            className={`
                              absolute
                              -top-10
                              z-20
                              flex
                              items-center
                              gap-0.5
                              rounded-full
                              border
                              border-gray-200
                              bg-white
                              px-1
                              py-1
                              shadow-lg
                              dark:border-gray-600
                              dark:bg-gray-800
                              sm:opacity-0
                              sm:transition-opacity
                              sm:group-hover/message:opacity-100
                              ${
                                isOwn
                                  ? "right-0"
                                  : "left-0"
                              }
                            `}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                setReactionPickerFor(
                                  reactionPickerFor ===
                                    message.id
                                    ? null
                                    : message.id
                                );
                              }}
                              className="
                                flex
                                h-8
                                w-8
                                items-center
                                justify-center
                                rounded-full
                                text-gray-500
                                hover:bg-gray-100
                                dark:text-gray-300
                                dark:hover:bg-gray-700
                              "
                              aria-label="React"
                            >
                              <Smile className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                setReplyingTo(message);
                                setReactionPickerFor(null);
                                setActiveMessageActions(null);
                              }}
                              className="
                                flex
                                h-8
                                w-8
                                items-center
                                justify-center
                                rounded-full
                                text-gray-500
                                hover:bg-gray-100
                                dark:text-gray-300
                                dark:hover:bg-gray-700
                              "
                              aria-label="Reply"
                            >
                              <Reply className="h-4 w-4" />
                            </button>

                            {isOwn &&
                              !message.imageUrl && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startEdit(message);
                                  }}
                                  className="
                                    flex
                                    h-8
                                    w-8
                                    items-center
                                    justify-center
                                    rounded-full
                                    text-gray-500
                                    hover:bg-gray-100
                                    dark:text-gray-300
                                    dark:hover:bg-gray-700
                                  "
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}

                            {isOwn && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteMessage(
                                    message.id
                                  );
                                }}
                                disabled={
                                  deletingMessageId ===
                                  message.id
                                }
                                className="
                                  flex
                                  h-8
                                  w-8
                                  items-center
                                  justify-center
                                  rounded-full
                                  text-gray-500
                                  hover:bg-red-100
                                  hover:text-red-600
                                  disabled:opacity-50
                                  dark:text-gray-300
                                  dark:hover:bg-red-900/30
                                "
                                aria-label={t(
                                  "chat.deleteMessage"
                                )}
                              >
                                {deletingMessageId ===
                                message.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {/* ===================================================
                            QUICK REACTIONS
                        =================================================== */}

                        {reactionPickerFor ===
                          message.id && (
                          <>
                            <button
                              type="button"
                              aria-label="Close reaction picker"
                              className="fixed inset-0 z-10 cursor-default"
                              onClick={(event) => {
                                event.stopPropagation();
                                setReactionPickerFor(
                                  null
                                );
                                setActiveMessageActions(
                                  null
                                );
                              }}
                            />

                            <div
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                              className={`
                                absolute
                                -top-12
                                z-30
                                flex
                                items-center
                                gap-0.5
                                rounded-full
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-1.5
                                shadow-xl
                                dark:border-gray-600
                                dark:bg-gray-800
                                ${
                                  isOwn
                                    ? "right-0"
                                    : "left-0"
                                }
                              `}
                            >
                              {QUICK_REACTIONS.map(
                                (emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      handleReact(
                                        message.id,
                                        emoji
                                      );
                                    }}
                                    className="
                                      flex
                                      h-8
                                      w-8
                                      items-center
                                      justify-center
                                      rounded-full
                                      text-lg
                                      transition-transform
                                      hover:scale-125
                                      hover:bg-gray-100
                                      dark:hover:bg-gray-700
                                    "
                                  >
                                    {emoji}
                                  </button>
                                )
                              )}
                            </div>
                          </>
                        )}

                        {/* ===================================================
                            REPLY PREVIEW
                        =================================================== */}

                        {message.replyTo && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();

                              scrollToMessage(
                                message.replyTo!.id
                              );
                            }}
                            className={`
                              mb-1.5
                              block
                              w-full
                              min-w-0
                              rounded-lg
                              border-l-2
                              px-2.5
                              py-1.5
                              text-left
                              text-xs
                              ${
                                isOwn
                                  ? "border-white/50 bg-white/10 text-white/80 hover:bg-white/15"
                                  : "border-gray-400 bg-black/5 text-gray-600 hover:bg-black/10 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                              }
                            `}
                          >
                            <p className="truncate font-semibold">
                              {message.replyTo
                                .sender.id ===
                              userId
                                ? "You"
                                : message.replyTo
                                    .sender.name}
                            </p>

                            <p className="mt-0.5 truncate opacity-90">
                              {message.replyTo
                                .content ||
                                (message.replyTo
                                  .imageUrl
                                  ? "📷 Image"
                                  : "")}
                            </p>
                          </button>
                        )}

                        {/* ===================================================
                            IMAGE / FILE / AUDIO
                        =================================================== */}

                        {message.imageUrl &&
                          (message.content?.startsWith(
                            "🎤"
                          ) ? (
                            <div
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                              className="
                                overflow-hidden
                                rounded-xl
                                bg-black/5
                                dark:bg-black/20
                              "
                            >
                              <audio
                                controls
                                preload="metadata"
                                src={
                                  message.imageUrl
                                }
                                onClick={(event) =>
                                  event.stopPropagation()
                                }
                                className="block max-w-full"
                                style={{
                                  height: "40px",
                                  width: "min(280px, 100%)",
                                }}
                              />
                            </div>
                          ) : failedImageIds.has(
                              message.id
                            ) ? (
                            <a
                              href={
                                message.imageUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveMessageActions(
                                  null
                                );
                              }}
                              className={`
                                flex
                                min-w-0
                                items-center
                                gap-2.5
                                rounded-xl
                                px-3
                                py-2.5
                                transition
                                ${
                                  isOwn
                                    ? "bg-white/15 hover:bg-white/25"
                                    : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500"
                                }
                              `}
                            >
                              <FileText className="h-6 w-6 shrink-0" />

                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {message.content?.replace(
                                  /^📎\s*/,
                                  ""
                                ) ||
                                  t(
                                    "chat.attachment"
                                  )}
                              </span>

                              <Download className="h-4 w-4 shrink-0" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="
                                group/image
                                relative
                                block
                                max-w-full
                                overflow-hidden
                                rounded-xl
                                text-left
                              "
                              onClick={(event) => {
                                event.stopPropagation();
                                openLightbox(
                                  message.imageUrl!
                                );
                              }}
                            >
                              <img
                                src={
                                  message.imageUrl
                                }
                                alt="Message attachment"
                                className="
                                  block
                                  max-h-72
                                  max-w-full
                                  rounded-xl
                                  object-contain
                                  sm:max-h-80
                                "
                                onError={() => {
                                  setFailedImageIds(
                                    (previous) => {
                                      const next =
                                        new Set(
                                          previous
                                        );

                                      next.add(
                                        message.id
                                      );

                                      return next;
                                    }
                                  });
                                }}
                              />

                              <span
                                className="
                                  absolute
                                  inset-0
                                  flex
                                  items-center
                                  justify-center
                                  rounded-xl
                                  bg-black/30
                                  opacity-0
                                  transition-opacity
                                  group-hover/image:opacity-100
                                "
                              >
                                <ZoomIn className="h-8 w-8 text-white" />
                              </span>
                            </button>
                          ))}

                        {/* ===================================================
                            EDITING
                        =================================================== */}

                        {isEditing ? (
                          <div
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            className="flex min-w-[180px] items-end gap-2"
                          >
                            <textarea
                              value={editContent}
                              onChange={(event) => {
                                setEditContent(
                                  event.target.value
                                );

                                event.target.style.height =
                                  "auto";

                                event.target.style.height = `${Math.min(
                                  event.target
                                    .scrollHeight,
                                  128
                                )}px`;
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key ===
                                    "Enter" &&
                                  !event.shiftKey
                                ) {
                                  event.preventDefault();
                                  saveEdit(
                                    message.id
                                  );
                                }

                                if (
                                  event.key ===
                                  "Escape"
                                ) {
                                  cancelEdit();
                                }
                              }}
                              rows={1}
                              autoFocus
                              className="
                                min-w-0
                                flex-1
                                resize-none
                                overflow-hidden
                                rounded-lg
                                bg-white/20
                                px-2
                                py-1.5
                                text-sm
                                text-inherit
                                outline-none
                                placeholder-white/60
                              "
                            />

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                saveEdit(
                                  message.id
                                );
                              }}
                              disabled={
                                savingEdit ||
                                !editContent.trim()
                              }
                              className="
                                flex
                                h-8
                                w-8
                                shrink-0
                                items-center
                                justify-center
                                rounded-full
                                hover:bg-white/20
                                disabled:opacity-50
                              "
                            >
                              {savingEdit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                cancelEdit();
                              }}
                              className="
                                flex
                                h-8
                                w-8
                                shrink-0
                                items-center
                                justify-center
                                rounded-full
                                hover:bg-white/20
                              "
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          displayContent && (
                            <p
                              className="
                                whitespace-pre-wrap
                                break-words
                                text-[14px]
                                leading-5
                                sm:text-sm
                                sm:leading-5
                              "
                            >
                              {displayContent}
                            </p>
                          )
                        )}

                        {/* ===================================================
                            TIME
                        =================================================== */}

                        <div
                          className={`
                            mt-1
                            flex
                            items-center
                            justify-end
                            gap-1
                            text-[10px]
                            leading-none
                            ${
                              isOwn
                                ? "text-red-100"
                                : "text-gray-400 dark:text-gray-400"
                            }
                          `}
                        >
                          <span>
                            {new Date(
                              message.createdAt
                            ).toLocaleTimeString(
                              localeMap[
                                language
                              ] || "en-US",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>

                          {message.edited && (
                            <span>
                              · edited
                            </span>
                          )}

                          {isOwn &&
                            message.read && (
                              <span className="ml-0.5 font-semibold">
                                ✓✓
                              </span>
                            )}
                        </div>
                      </div>

                      {/* =====================================================
                          REACTION PILLS
                      ===================================================== */}

                      {reactionGroups.length >
                        0 && (
                        <div
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          className={`
                            mt-1
                            flex
                            flex-wrap
                            gap-1
                            ${
                              isOwn
                                ? "justify-end"
                                : "justify-start"
                            }
                          `}
                        >
                          {reactionGroups.map(
                            (group) => {
                              const reacted =
                                group.users.some(
                                  (user) =>
                                    user.id ===
                                    userId
                                );

                              return (
                                <button
                                  type="button"
                                  key={
                                    group.emoji
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();

                                    handleReact(
                                      message.id,
                                      group.emoji
                                    );
                                  }}
                                  title={group.users
                                    .map(
                                      (user) =>
                                        user.name ||
                                        user.username
                                    )
                                    .join(
                                      ", "
                                    )}
                                  className={`
                                    flex
                                    min-h-[24px]
                                    items-center
                                    gap-1
                                    rounded-full
                                    border
                                    px-2
                                    py-0.5
                                    text-xs
                                    transition
                                    ${
                                      reacted
                                        ? "border-zrp-red bg-zrp-red/10 text-zrp-red"
                                        : "border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                    }
                                  `}
                                >
                                  <span>
                                    {
                                      group.emoji
                                    }
                                  </span>

                                  {group.users
                                      .length >
                                    1 && (
                                    <span>
                                      {
                                        group
                                          .users
                                          .length
                                      }
                                    </span>
                                  )}
                                </button>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              ref={messagesEndRef}
              className="h-px w-full shrink-0"
              aria-hidden="true"
            />
          </div>
        )}
      </main>

      {/* =======================================================================
          REPLY PREVIEW
      ======================================================================= */}

      {replyingTo && (
        <div
          className="
            relative
            z-20
            flex
            shrink-0
            items-center
            gap-2
            border-t
            border-gray-200
            bg-white
            px-3
            py-2
            dark:border-gray-700
            dark:bg-zrp-deepBlack
            sm:px-4
          "
        >
          <Reply className="h-4 w-4 shrink-0 text-zrp-red" />

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-zrp-red">
              Replying to{" "}
              {replyingTo.senderId === userId
                ? "yourself"
                : receiverName}
            </p>

            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {replyingTo.content ||
                (replyingTo.imageUrl
                  ? "📷 Image"
                  : "")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setReplyingTo(null);
              setActiveMessageActions(null);
            }}
            className="
              flex
              h-8
              w-8
              shrink-0
              items-center
              justify-center
              rounded-full
              text-gray-400
              hover:bg-gray-100
              hover:text-gray-700
              dark:hover:bg-gray-700
              dark:hover:text-white
            "
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* =======================================================================
          COMPOSER
      ======================================================================= */}

      <form
        onSubmit={handleSend}
        className="
          relative
          z-30
          shrink-0
          border-t
          border-gray-200
          bg-white
          dark:border-gray-700
          dark:bg-zrp-deepBlack
        "
        style={{
          paddingBottom:
            "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        {isRecording ? (
          <div
            className="
              flex
              min-h-[58px]
              items-center
              gap-2
              px-2
              py-2
              sm:gap-3
              sm:px-4
            "
          >
            <button
              type="button"
              onClick={cancelRecording}
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-red-500
                dark:hover:bg-gray-700
              "
              title={t(
                "chat.cancelRecording"
              )}
              aria-label={t(
                "chat.cancelRecording"
              )}
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />

            <span className="shrink-0 text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200">
              {formatRecordingTime(
                recordingSeconds
              )}
            </span>

            <span className="min-w-0 flex-1 truncate text-sm text-gray-400 dark:text-gray-500">
              {t("chat.recording")}
            </span>

            <button
              type="button"
              onClick={
                stopAndSendRecording
              }
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-zrp-red
                text-white
                shadow-sm
                transition
                hover:bg-zrp-darkRed
              "
              title={t(
                "chat.sendVoiceMessage"
              )}
              aria-label={t(
                "chat.sendVoiceMessage"
              )}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div
            className="
              flex
              min-w-0
              items-end
              gap-0.5
              px-2
              py-2
              sm:gap-1.5
              sm:px-3
              md:px-4
            "
          >
            {/* IMAGE */}

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={uploadingImage}
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-zrp-red
                disabled:opacity-50
                dark:text-gray-400
                dark:hover:bg-gray-700
              "
              title={t(
                "chat.uploadImage"
              )}
              aria-label={t(
                "chat.uploadImage"
              )}
            >
              {uploadingImage ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zrp-red border-t-transparent" />
              ) : (
                <Image className="h-5 w-5" />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* DOCUMENT */}

            <button
              type="button"
              onClick={() =>
                documentInputRef.current?.click()
              }
              disabled={uploadingImage}
              className="
                hidden
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-zrp-red
                disabled:opacity-50
                dark:text-gray-400
                dark:hover:bg-gray-700
                sm:flex
              "
              title={t(
                "chat.uploadDocument"
              )}
              aria-label={t(
                "chat.uploadDocument"
              )}
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <input
              ref={documentInputRef}
              type="file"
              accept="
                .pdf,
                .doc,
                .docx,
                .xls,
                .xlsx,
                .ppt,
                .pptx,
                .txt,
                application/pdf,
                application/msword,
                application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                application/vnd.ms-excel,
                application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
                application/vnd.ms-powerpoint,
                application/vnd.openxmlformats-officedocument.presentationml.presentation,
                text/plain
              "
              onChange={
                handleDocumentUpload
              }
              className="hidden"
            />

            {/* EMOJI */}

            <button
              type="button"
              onClick={() =>
                setShowEmojiPicker(
                  (previous) => !previous
                )
              }
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                text-gray-500
                transition
                hover:bg-gray-100
                hover:text-zrp-red
                dark:text-gray-400
                dark:hover:bg-gray-700
              "
              title={t(
                "chat.addEmoji"
              )}
              aria-label={t(
                "chat.addEmoji"
              )}
            >
              <Smile className="h-5 w-5" />
            </button>

            {/* TEXT INPUT */}

            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleTyping}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();

                  handleSend();
                }
              }}
              placeholder={t(
                "chat.messagePlaceholder",
                {
                  name: receiverName,
                }
              )}
              rows={1}
              enterKeyHint="send"
              className="
                min-h-[40px]
                min-w-0
                flex-1
                resize-none
                overflow-y-auto
                rounded-2xl
                border
                border-gray-300
                bg-white
                px-3
                py-2
                text-sm
                leading-5
                text-gray-900
                outline-none
                transition
                placeholder:text-gray-400
                focus:border-zrp-red
                focus:ring-2
                focus:ring-zrp-red/20
                dark:border-gray-600
                dark:bg-gray-700
                dark:text-white
                dark:placeholder:text-gray-400
              "
              style={{
                maxHeight: "128px",
              }}
            />

            {/* SEND / MICROPHONE */}

            {newMessage.trim() ? (
              <button
                type="submit"
                disabled={sending}
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-zrp-red
                  text-white
                  shadow-sm
                  transition
                  hover:bg-zrp-darkRed
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploadingImage}
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-zrp-red
                  text-white
                  shadow-sm
                  transition
                  hover:bg-zrp-darkRed
                  disabled:opacity-50
                "
                title={t(
                  "chat.recordVoiceMessage"
                )}
                aria-label={t(
                  "chat.recordVoiceMessage"
                )}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </form>

      {/* =======================================================================
          EMOJI PICKER
      ======================================================================= */}

      {showEmojiPicker && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-end
            justify-center
            bg-black/40
            p-0
            sm:items-center
            sm:p-4
          "
          onClick={() =>
            setShowEmojiPicker(false)
          }
        >
          <div
            className="
              w-full
              max-w-[420px]
              overflow-hidden
              rounded-t-2xl
              bg-white
              shadow-2xl
              dark:bg-zrp-deepBlack
              sm:rounded-2xl
            "
            style={{
              paddingBottom:
                "env(safe-area-inset-bottom)",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex h-11 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t("chat.addEmoji")}
              </span>

              <button
                type="button"
                onClick={() =>
                  setShowEmojiPicker(false)
                }
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-full
                  text-gray-500
                  hover:bg-gray-100
                  dark:hover:bg-gray-700
                "
                aria-label="Close emoji picker"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <EmojiPicker
              onEmojiClick={
                handleEmojiClick
              }
              width="100%"
              height={380}
            />
          </div>
        </div>
      )}

      {/* =======================================================================
          LIGHTBOX
      ======================================================================= */}

      {lightboxImage && (
        <div
          className="
            fixed
            inset-0
            z-[999]
            flex
            items-center
            justify-center
            bg-black/90
            p-3
            sm:p-6
          "
          onClick={closeLightbox}
        >
          <div
            className="
              relative
              flex
              h-full
              max-h-[92vh]
              w-full
              max-w-5xl
              items-center
              justify-center
            "
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <img
              src={lightboxImage}
              alt="Full size"
              className="
                max-h-full
                max-w-full
                rounded-lg
                object-contain
              "
            />

            <button
              type="button"
              onClick={closeLightbox}
              className="
                absolute
                right-1
                top-1
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                bg-black/60
                text-white
                transition
                hover:bg-black/80
                sm:right-2
                sm:top-2
              "
              aria-label="Close image"
            >
              <X className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={downloadImage}
              className="
                absolute
                bottom-2
                right-1
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-full
                bg-zrp-red
                text-white
                shadow-lg
                transition
                hover:bg-zrp-darkRed
                sm:bottom-4
                sm:right-2
              "
              title={t(
                "chat.downloadImage"
              )}
              aria-label={t(
                "chat.downloadImage"
              )}
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}