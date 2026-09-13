"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import {
  Send,
  Image as ImageIcon,
  Smile,
  X,
  Download,
  ZoomIn,
  Trash2,
  Loader2,
  Paperclip,
  FileText,
  Mic,
  Users,
  Info,
  WifiOff,
  Video,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import GroupInfoPanel from "@/components/GroupInfoPanel";
import ConfirmModal from "@/components/ConfirmModal";
import { hydrateGroupSocketMessage, type RawGroupSocketMessage } from "@/lib/groupMessageHydration";
import { describeGroupTyping } from "@/lib/groupTyping";
import type { GroupConversationDetail, GroupParticipantUser } from "@/lib/groupConversationTypes";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

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

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];

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

interface GroupMessage {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  createdAt: string;
  imageUrl?: string | null;
  edited?: boolean;
  reactions?: Reaction[];
  sender: GroupParticipantUser;
}

interface GroupChatInterfaceProps {
  conversationId: string;
  // Fired once this user's own DELETE .../participants/{self} (leaving
  // the group, from GroupInfoPanel) succeeds - the page wrapper owns
  // navigation (back to /messages), not this component, the same
  // separation ChatPage/[username] already keeps between "the thread"
  // and "where to go next".
  onLeftGroup?: () => void;
}

// Consecutive messages from the same sender within this window render as
// one visual cluster (avatar/name shown once) instead of repeating the
// sender's identity on every single bubble - the same "grouping" a real
// chat product does, and what the spec's own "message grouping" item
// asks for.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export default function GroupChatInterface({ conversationId, onLeftGroup }: GroupChatInterfaceProps) {
  const { data: session } = useSession();
  const { refreshUnreadMessageCount } = useUnreadCount();
  const { t, language } = useLanguage();
  const userId = session?.user?.id;

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  // ─── Conversation ───────────────────────────────────────────────────
  const [conversation, setConversation] = useState<GroupConversationDetail | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  const participants = useMemo(
    () => conversation?.participants.map((p) => p.user) ?? [],
    [conversation]
  );
  const myRole = conversation?.participants.find((p) => p.userId === userId)?.role;

  // The socket effect below intentionally mounts once per
  // [userId, conversationId] and does NOT re-subscribe when the
  // participant roster changes (adding/removing a member would
  // otherwise re-join the room and briefly drop events for no reason).
  // Its handlers read participantsRef.current instead of the `participants`
  // variable directly so they always see the CURRENT roster rather than
  // whatever it was on the render that mounted the effect - conversation
  // (and therefore participants) loads asynchronously and is still `[]`
  // on that very first render.
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const fetchConversation = async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch conversation");
      const data = await res.json();
      setConversation(data);
    } catch (error) {
      console.error("Error fetching group conversation:", error);
      setNotFound(true);
    } finally {
      setLoadingConversation(false);
    }
  };

  // ─── Messages ───────────────────────────────────────────────────────
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const mergeById = (prev: GroupMessage[], incoming: GroupMessage[]) => {
    const byId = new Map(prev.map((m) => [m.id, m]));
    incoming.forEach((m) => byId.set(m.id, m));
    return Array.from(byId.values()).sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  };

  const fetchInitialMessages = async () => {
    setMessagesError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      setMessages(Array.isArray(data.items) ? data.items : []);
      setOldestCursor(data.nextCursor ?? null);
      refreshUnreadMessageCount();
    } catch (error) {
      console.error("Error fetching group messages:", error);
      setMessagesError(t("group.thread.errLoadMessages"));
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadEarlier = async () => {
    if (!oldestCursor || loadingOlder) return;
    setLoadingOlder(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(oldestCursor)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      const older: GroupMessage[] = Array.isArray(data.items) ? data.items : [];
      setMessages((prev) => mergeById(prev, older));
      setOldestCursor(data.nextCursor ?? null);
      requestAnimationFrame(() => {
        if (!container) return;
        container.scrollTop = container.scrollHeight - prevScrollHeight;
      });
    } catch (error) {
      console.error("Error loading earlier group messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Real-time messages carry no imageUrl/reactions/replyTo (server.js's
  // own send-group-message payload is deliberately minimal - see
  // groupMessageHydration's own KDoc), so a background REST re-fetch
  // shortly after any real-time activity replaces the hydrated stand-in
  // with the authoritative row. Debounced so a burst of messages
  // triggers one fetch, not one per message; never touches oldestCursor
  // so it can never clobber a "load earlier" position already reached.
  const backgroundSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundSync = () => {
    if (backgroundSyncTimeoutRef.current) clearTimeout(backgroundSyncTimeoutRef.current);
    backgroundSyncTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const latest: GroupMessage[] = Array.isArray(data.items) ? data.items : [];
        setMessages((prev) => mergeById(prev, latest));
        refreshUnreadMessageCount();
      } catch (error) {
        console.error("Group background sync failed:", error);
      }
    }, 800);
  };

  useEffect(() => {
    setConversation(null);
    setLoadingConversation(true);
    setNotFound(false);
    setMessages([]);
    setLoadingMessages(true);
    setOldestCursor(null);
    fetchConversation();
    fetchInitialMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ─── Scroll to bottom on new messages ──────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialMessagesLoadedRef = useRef(false);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  };

  useEffect(() => {
    if (!initialMessagesLoadedRef.current && messages.length > 0) {
      initialMessagesLoadedRef.current = true;
      lastMessageCountRef.current = messages.length;
      setTimeout(() => scrollToBottom("auto"), 50);
      return;
    }
    if (messages.length > lastMessageCountRef.current) {
      scrollToBottom("smooth");
    }
    lastMessageCountRef.current = messages.length;
  }, [messages]);

  // ─── Socket: join/leave room, real-time events ─────────────────────
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<any>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!userId) return;

    const socket = getSocket(userId);
    socketRef.current = socket;

    const joinRoom = () => socket.emit("join-conversation", conversationId);

    const handleConnect = () => {
      setSocketConnected(true);
      joinRoom();
      backgroundSync();
    };
    const handleDisconnect = () => setSocketConnected(false);
    const handleConnectError = () => setSocketConnected(false);

    const handleReceive = (raw: RawGroupSocketMessage) => {
      if (raw.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === raw.id)) return prev;
        const hydrated = hydrateGroupSocketMessage(raw, participantsRef.current);
        return mergeById(prev, [hydrated as unknown as GroupMessage]);
      });
      if (raw.senderId !== userId) {
        // Clear that sender's typing indicator - they just sent, so
        // they're no longer "typing" even if a stop event races this.
        setTypingUsers((prev) => {
          if (!prev.has(raw.senderId)) return prev;
          const next = new Map(prev);
          next.delete(raw.senderId);
          return next;
        });
      }
      backgroundSync();
    };

    const handleTyping = ({
      conversationId: cid,
      userId: typingUserId,
      isTyping,
    }: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (cid !== conversationId || typingUserId === userId) return;
      const existingTimer = typingTimersRef.current.get(typingUserId);
      if (existingTimer) clearTimeout(existingTimer);

      if (!isTyping) {
        typingTimersRef.current.delete(typingUserId);
        setTypingUsers((prev) => {
          if (!prev.has(typingUserId)) return prev;
          const next = new Map(prev);
          next.delete(typingUserId);
          return next;
        });
        return;
      }

      const person = participantsRef.current.find((p) => p.id === typingUserId);
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(typingUserId, person?.name || person?.username || typingUserId);
        return next;
      });

      // Auto-clear after 5s in case a "stopped typing" event is dropped
      // (tab closed, network blip) - a typing dot that never goes away
      // is a worse failure than one that clears a beat early.
      typingTimersRef.current.set(
        typingUserId,
        setTimeout(() => {
          setTypingUsers((prev) => {
            if (!prev.has(typingUserId)) return prev;
            const next = new Map(prev);
            next.delete(typingUserId);
            return next;
          });
        }, 5000)
      );
    };

    const handleDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setActiveMessageActions((current) => (current === messageId ? null : current));
    };

    const handleReactionUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("receive-group-message", handleReceive);
    socket.on("user-typing-group", handleTyping);
    socket.on("message-deleted", handleDeleted);
    socket.on("reaction-updated", handleReactionUpdated);

    setSocketConnected(socket.connected);
    joinRoom();

    return () => {
      socket.emit("leave-conversation", conversationId);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("receive-group-message", handleReceive);
      socket.off("user-typing-group", handleTyping);
      socket.off("message-deleted", handleDeleted);
      socket.off("reaction-updated", handleReactionUpdated);
      const pendingTypingTimers = typingTimersRef.current;
      pendingTypingTimers.forEach((timer) => clearTimeout(timer));
      pendingTypingTimers.clear();
      if (backgroundSyncTimeoutRef.current) clearTimeout(backgroundSyncTimeoutRef.current);
    };
    // participants is intentionally read fresh via closure on each
    // event rather than added as a dep - re-subscribing the whole socket
    // effect every time a member is added/removed would re-join the
    // room and briefly drop events for no reason. handleReceive/
    // handleTyping only need the LATEST participants at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, conversationId]);

  // ─── Composer state ─────────────────────────────────────────────────
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [activeMessageActions, setActiveMessageActions] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendGroupMessage = async (content: string, imageUrl: string | null) => {
    if (!content.trim() && !imageUrl) return;
    if (!userId || !session?.user) return;

    setSending(true);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: GroupMessage = {
      id: tempId,
      content: content || "",
      senderId: userId,
      conversationId,
      createdAt: new Date().toISOString(),
      imageUrl,
      reactions: [],
      sender: {
        id: userId,
        username: session.user.username || "",
        name: session.user.name || null,
        avatarUrl: session.user.avatarUrl || null,
        badgeType: session.user.badgeType || null,
      },
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");
    setActiveMessageActions(null);
    setReactionPickerFor(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content || "", imageUrl, replyToId: null }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Failed to send message");
      }
      const saved = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      socketRef.current?.emit("send-group-message", {
        conversationId,
        content: content || "",
        messageId: saved.id,
      });
    } catch (error: any) {
      console.error("Group send error:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert(t("chat.errSendFailed", { error: error?.message || "Unknown error" }));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!newMessage.trim() || !userId) return;
    await sendGroupMessage(newMessage.trim(), null);
  };

  const stopTypingSignal = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socketRef.current?.emit("typing-group", { conversationId, isTyping: false });
    }
  };

  const handleTypingInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setNewMessage(value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current?.emit("typing-group", { conversationId, isTyping: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTypingSignal, 1000);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // ─── Delete ─────────────────────────────────────────────────────────
  const canDelete = (message: GroupMessage) => message.senderId === userId || myRole === "OWNER";

  // Opens the in-app confirmation modal (see ConfirmModal's doc comment
  // for why window.confirm() is not used) - the actual deletion only
  // happens from confirmPendingDelete below, once the user confirms.
  const requestDeleteMessage = (messageId: string) => {
    setDeleteError(null);
    setPendingDeleteId(messageId);
    setActiveMessageActions(null);
    setReactionPickerFor(null);
  };

  const confirmPendingDelete = async () => {
    const messageId = pendingDeleteId;
    if (!messageId) return;

    setDeletingMessageId(messageId);
    try {
      const res = await fetch(`/api/messages/delete/${messageId}`, { method: "DELETE" });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        socketRef.current?.emit("delete-message", { messageId, conversationId });
        setPendingDeleteId(null);
      } else {
        const err = await res.json().catch(() => null);
        setDeleteError(err?.error || t("chat.errDeleteMessage"));
        setPendingDeleteId(null);
      }
    } catch (error) {
      console.error("Delete group message error:", error);
      setDeleteError(t("chat.errDeleteMessage"));
      setPendingDeleteId(null);
    } finally {
      setDeletingMessageId(null);
    }
  };

  useEffect(() => {
    if (!deleteError) return;
    const timer = setTimeout(() => setDeleteError(null), 4000);
    return () => clearTimeout(timer);
  }, [deleteError]);

  // ─── Reactions ──────────────────────────────────────────────────────
  const handleReact = async (messageId: string, emoji: string) => {
    setReactionPickerFor(null);
    setActiveMessageActions(null);
    try {
      const res = await fetch(`/api/messages/reaction/${messageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
      socketRef.current?.emit("message-reaction", { messageId, reactions: data.reactions, conversationId });
    } catch (error) {
      console.error("Group reaction error:", error);
    }
  };

  const groupReactions = (reactions?: Reaction[]) => {
    if (!reactions?.length) return [];
    const map = new Map<string, ReactionUser[]>();
    reactions.forEach((r) => {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.user);
    });
    return Array.from(map.entries()).map(([emoji, users]) => ({ emoji, users }));
  };

  // ─── Attachments ────────────────────────────────────────────────────
  const { startUpload: startImageUpload } = useUploadThing("chatImage", {
    onClientUploadComplete: (files) => {
      setUploadingImage(false);
      if (files?.length) sendGroupMessage("", files[0].ufsUrl);
    },
    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  const { startUpload: startFileUpload } = useUploadThing("chatFile", {
    onClientUploadComplete: (files) => {
      setUploadingImage(false);
      if (files?.length) sendGroupMessage(`📎 ${files[0].name}`, files[0].ufsUrl);
    },
    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  const formatRecordingTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const recordingSecondsRef = useRef(0);
  const { startUpload: startAudioUpload } = useUploadThing("chatAudio", {
    onClientUploadComplete: (files) => {
      setUploadingImage(false);
      if (files?.length) {
        sendGroupMessage(`🎤 Voice message (${formatRecordingTime(recordingSecondsRef.current)})`, files[0].ufsUrl);
      }
      recordingSecondsRef.current = 0;
    },
    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  const { startUpload: startVideoUpload } = useUploadThing("chatVideo", {
    onClientUploadComplete: (files) => {
      setUploadingImage(false);
      if (files?.length) sendGroupMessage("🎬 Video", files[0].ufsUrl);
    },
    onUploadError: (error) => {
      setUploadingImage(false);
      alert(t("chat.errImageUploadFailed") + " " + error.message);
    },
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      event.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      await startImageUpload([file]);
    } catch (error) {
      console.error("Group image upload error:", error);
      setUploadingImage(false);
      alert(t("chat.errUploadFailedRetry"));
    }
    event.target.value = "";
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      event.target.value = "";
      return;
    }
    if (!DOCUMENT_TYPES.includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      await startFileUpload([file]);
    } catch (error) {
      console.error("Group document upload error:", error);
      setUploadingImage(false);
      alert(t("chat.errUploadFailedRetry"));
    }
    event.target.value = "";
  };

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) {
      alert(t("chat.errFileTooLarge"));
      event.target.value = "";
      return;
    }
    if (!VIDEO_TYPES.includes(file.type)) {
      alert(t("chat.errInvalidFileType"));
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      await startVideoUpload([file]);
    } catch (error) {
      console.error("Group video upload error:", error);
      setUploadingImage(false);
      alert(t("chat.errUploadFailedRetry"));
    }
    event.target.value = "";
  };

  // ─── Voice recording ────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCancelledRef = useRef(false);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(t("chat.errMicAccess"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingCancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (recordingCancelledRef.current || audioChunksRef.current.length === 0) {
          audioChunksRef.current = [];
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        audioChunksRef.current = [];
        const extension = mimeType?.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-message.${extension}`, { type: blob.type });
        setUploadingImage(true);
        try {
          await startAudioUpload([file]);
        } catch (error) {
          console.error("Group voice message upload error:", error);
          setUploadingImage(false);
          alert(t("chat.errUploadFailedRetry"));
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (error) {
      console.error("Microphone access error:", error);
      alert(t("chat.errMicAccess"));
    }
  };

  const stopAndSendRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    recordingCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // ─── Emoji ──────────────────────────────────────────────────────────
  const handleEmojiClick = (emoji: any) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? newMessage.length;
    const end = textarea?.selectionEnd ?? newMessage.length;
    const updated = newMessage.slice(0, start) + emoji.emoji + newMessage.slice(end);
    setNewMessage(updated);
    setShowEmojiPicker(false);
    setTimeout(() => {
      if (!textareaRef.current) return;
      const pos = start + emoji.emoji.length;
      textareaRef.current.selectionStart = pos;
      textareaRef.current.selectionEnd = pos;
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
      textareaRef.current.focus();
    }, 0);
  };

  // ─── Lightbox ───────────────────────────────────────────────────────
  const openLightbox = (imageUrl: string) => {
    setActiveMessageActions(null);
    setLightboxImage(imageUrl);
  };
  const closeLightbox = () => setLightboxImage(null);
  const downloadImage = () => {
    if (!lightboxImage) return;
    const link = document.createElement("a");
    link.href = lightboxImage;
    link.download = `image-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Typing label ───────────────────────────────────────────────────
  const typingLabel = describeGroupTyping(Array.from(typingUsers.values()));

  // ─── Not-found / error states ───────────────────────────────────────
  if (notFound) {
    return (
      <div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-2 bg-white p-6 text-center dark:bg-zrp-deepBlack">
        <Users className="h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="font-medium text-gray-700 dark:text-gray-300">{t("group.thread.notFound")}</p>
        <p className="max-w-xs text-sm text-gray-400 dark:text-gray-500">{t("group.thread.notFoundDesc")}</p>
      </div>
    );
  }

  if (loadingConversation || loadingMessages) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center bg-white dark:bg-zrp-deepBlack">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("chat.loadingMessages")}
        </div>
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  const groupName = conversation.name || t("group.new");

  return (
    <div
      className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-none border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-zrp-deepBlack sm:rounded-xl"
      style={{ height: "100%", minHeight: 0 }}
    >
      {/* HEADER */}
      <header className="relative z-30 flex min-h-[60px] shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-zrp-deepBlack sm:min-h-[68px] sm:px-4">
        <button
          type="button"
          onClick={() => setShowInfoPanel(true)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity hover:opacity-80 focus:outline-none sm:gap-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zrp-red/10 font-semibold text-zrp-red sm:h-10 sm:w-10">
            {conversation.avatarUrl ? (
              <img src={conversation.avatarUrl} alt={groupName} className="h-full w-full object-cover" />
            ) : (
              <Users className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white sm:text-base">
                {groupName}
              </span>
            </div>
            {typingLabel.kind !== "none" ? (
              <p className="truncate text-xs font-medium text-zrp-red">
                {typingLabel.kind === "one" && t("group.thread.typingOne", { name: typingLabel.name })}
                {typingLabel.kind === "two" &&
                  t("group.thread.typingTwo", { name1: typingLabel.name1, name2: typingLabel.name2 })}
                {typingLabel.kind === "many" && t("group.thread.typingMany", { count: typingLabel.count })}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {t("group.memberCount", { count: conversation.participants.length })}
              </p>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {!socketConnected && (
            <span
              className="hidden items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400 sm:flex"
              role="status"
              aria-live="polite"
            >
              <WifiOff className="h-3.5 w-3.5" />
              {t("group.thread.reconnecting")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowInfoPanel(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-zrp-red dark:text-gray-400 dark:hover:bg-gray-700"
            title={t("group.thread.info")}
            aria-label={t("group.thread.info")}
          >
            <Info className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* MESSAGES */}
      <div
        ref={messagesContainerRef}
        className="relative z-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-4 sm:py-4"
        style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
      >
        {messagesError ? (
          <div className="flex min-h-full items-center justify-center px-6 text-center">
            <div>
              <p className="font-medium text-gray-500 dark:text-gray-400">{messagesError}</p>
              <button
                type="button"
                onClick={fetchInitialMessages}
                className="mt-3 text-sm font-medium text-zrp-red hover:underline"
              >
                {t("action.retry")}
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zrp-red/10 text-zrp-red">
                <Users className="h-6 w-6" />
              </div>
              <p className="font-medium text-gray-500 dark:text-gray-400">{t("group.thread.noMessagesYet")}</p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{t("group.thread.sayHello")}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            {oldestCursor && (
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  onClick={loadEarlier}
                  disabled={loadingOlder}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  {loadingOlder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("group.thread.loadEarlier")}
                </button>
              </div>
            )}

            <div className="space-y-2 sm:space-y-2.5">
              {messages.map((message, idx) => {
                const isOwn = message.senderId === userId;
                const prev = idx > 0 ? messages[idx - 1] : null;
                const isFirstOfCluster =
                  !prev ||
                  prev.senderId !== message.senderId ||
                  new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_WINDOW_MS;

                // The legacy "📷 Image" marker is the only content value
                // that is never real user text - every other marker
                // (📎 filename, 🎤 voice duration, 🎬 Video) is shown
                // as-is, matching 1:1 ChatInterface's own displayContent
                // rule exactly.
                const displayContent = message.content && message.content !== "📷 Image" ? message.content : "";
                const reactionGroups = groupReactions(message.reactions);
                const isActive = activeMessageActions === message.id;
                const senderName = message.sender.name || message.sender.username;

                return (
                  <div
                    key={message.id}
                    id={`msg-${message.id}`}
                    onClick={() => {
                      setActiveMessageActions((current) => (current === message.id ? null : message.id));
                      if (reactionPickerFor && reactionPickerFor !== message.id) setReactionPickerFor(null);
                    }}
                    className={`group/message flex w-full cursor-pointer gap-2 ${
                      isOwn ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isOwn && (
                      <div className="w-7 flex-shrink-0 self-end">
                        {isFirstOfCluster && (
                          <div className="h-7 w-7 overflow-hidden rounded-full bg-gray-200 text-[11px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300 flex items-center justify-center">
                            {message.sender.avatarUrl ? (
                              <img src={message.sender.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              senderName[0]?.toUpperCase()
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className={`relative min-w-0 max-w-[80%] sm:max-w-[72%] md:max-w-[68%] lg:max-w-[62%] ${
                        isOwn ? "items-end" : "items-start"
                      }`}
                    >
                      {!isOwn && isFirstOfCluster && (
                        <p className="mb-0.5 flex items-center gap-1 px-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {senderName}
                          <VerifiedBadge badgeType={message.sender.badgeType} className="flex-shrink-0" />
                        </p>
                      )}

                      <div
                        className={`relative min-w-0 rounded-2xl px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:px-3.5 ${
                          isOwn
                            ? "rounded-br-md bg-zrp-red text-white"
                            : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
                        }`}
                      >
                        {isActive && (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className={`absolute -top-10 z-20 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800 sm:opacity-0 sm:transition-opacity sm:group-hover/message:opacity-100 ${
                              isOwn ? "right-0" : "left-0"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setReactionPickerFor(reactionPickerFor === message.id ? null : message.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                              aria-label={t("chat.reactAria")}
                            >
                              <Smile className="h-4 w-4" />
                            </button>

                            {canDelete(message) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestDeleteMessage(message.id);
                                }}
                                disabled={deletingMessageId === message.id}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-red-900/30"
                                aria-label={t("chat.deleteMessage")}
                              >
                                {deletingMessageId === message.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {reactionPickerFor === message.id && (
                          <>
                            <button
                              type="button"
                              aria-label={t("chat.closeReactionPickerAria")}
                              className="fixed inset-0 z-10 cursor-default"
                              onClick={(event) => {
                                event.stopPropagation();
                                setReactionPickerFor(null);
                                setActiveMessageActions(null);
                              }}
                            />
                            <div
                              onClick={(event) => event.stopPropagation()}
                              className={`absolute -top-12 z-30 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-xl dark:border-gray-600 dark:bg-gray-800 ${
                                isOwn ? "right-0" : "left-0"
                              }`}
                            >
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleReact(message.id, emoji);
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {message.imageUrl && (
                          <>
                            {message.content?.startsWith("🎬") ? (
                              <video
                                controls
                                preload="metadata"
                                src={message.imageUrl}
                                onClick={(event) => event.stopPropagation()}
                                className="block max-h-72 max-w-full rounded-xl sm:max-h-80"
                              />
                            ) : message.content?.startsWith("🎤") ? (
                              <div
                                onClick={(event) => event.stopPropagation()}
                                className="overflow-hidden rounded-xl bg-black/5 dark:bg-black/20"
                              >
                                <audio
                                  controls
                                  preload="metadata"
                                  src={message.imageUrl}
                                  onClick={(event) => event.stopPropagation()}
                                  className="block max-w-full"
                                  style={{ height: "40px", width: "min(280px, 100%)" }}
                                />
                              </div>
                            ) : failedImageIds.has(message.id) ? (
                              <a
                                href={message.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveMessageActions(null);
                                }}
                                className={`flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 transition ${
                                  isOwn
                                    ? "bg-white/15 hover:bg-white/25"
                                    : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500"
                                }`}
                              >
                                <FileText className="h-6 w-6 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {message.content?.replace(/^📎\s*/, "") || t("chat.attachment")}
                                </span>
                                <Download className="h-4 w-4 shrink-0" />
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="group/image relative block max-w-full overflow-hidden rounded-xl text-left"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openLightbox(message.imageUrl!);
                                }}
                              >
                                <img
                                  src={message.imageUrl}
                                  alt="Message attachment"
                                  className="block max-h-72 max-w-full rounded-xl object-contain sm:max-h-80"
                                  onError={() => {
                                    setFailedImageIds((prev) => {
                                      const next = new Set(prev);
                                      next.add(message.id);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover/image:opacity-100">
                                  <ZoomIn className="h-8 w-8 text-white" />
                                </span>
                              </button>
                            )}
                          </>
                        )}

                        {displayContent && (
                          <p className="whitespace-pre-wrap break-words text-[14px] leading-5 sm:text-sm sm:leading-5">
                            {displayContent}
                          </p>
                        )}

                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] leading-none ${
                            isOwn ? "text-red-100" : "text-gray-400 dark:text-gray-400"
                          }`}
                        >
                          <span>
                            {new Date(message.createdAt).toLocaleTimeString(localeMap[language] || "en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {reactionGroups.length > 0 && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className={`mt-1 flex flex-wrap gap-1 ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          {reactionGroups.map((group) => {
                            const reacted = group.users.some((u) => u.id === userId);
                            return (
                              <button
                                type="button"
                                key={group.emoji}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleReact(message.id, group.emoji);
                                }}
                                title={group.users.map((u) => u.name || u.username).join(", ")}
                                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                                  reacted
                                    ? "border-zrp-red bg-zrp-red/10 text-zrp-red"
                                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                }`}
                              >
                                <span>{group.emoji}</span>
                                <span>{group.users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* COMPOSER */}
      <form
        onSubmit={handleSend}
        className="relative z-30 shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-zrp-deepBlack"
      >
        {isRecording ? (
          <div className="flex min-h-[58px] items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
            <button
              type="button"
              onClick={cancelRecording}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700"
              title={t("chat.cancelRecording")}
              aria-label={t("chat.cancelRecording")}
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="shrink-0 text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200">
              {formatRecordingTime(recordingSeconds)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-gray-400 dark:text-gray-500">
              {t("chat.recording")}
            </span>
            <button
              type="button"
              onClick={stopAndSendRecording}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zrp-red text-white shadow-sm transition hover:bg-zrp-darkRed"
              title={t("chat.sendVoiceMessage")}
              aria-label={t("chat.sendVoiceMessage")}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 items-end gap-0.5 px-2 py-2 sm:gap-1.5 sm:px-3 md:px-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-zrp-red disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
              title={t("chat.uploadImage")}
              aria-label={t("chat.uploadImage")}
            >
              {uploadingImage ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zrp-red border-t-transparent" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

            <button
              type="button"
              onClick={() => documentInputRef.current?.click()}
              disabled={uploadingImage}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-zrp-red disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 sm:flex"
              title={t("chat.uploadDocument")}
              aria-label={t("chat.uploadDocument")}
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input
              ref={documentInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
              onChange={handleDocumentUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingImage}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-zrp-red disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 sm:flex"
              title={t("chat.uploadVideoAria")}
              aria-label={t("chat.uploadVideoAria")}
            >
              <Video className="h-5 w-5" />
            </button>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
              onChange={handleVideoUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-zrp-red dark:text-gray-400 dark:hover:bg-gray-700"
              title={t("chat.addEmoji")}
              aria-label={t("chat.addEmoji")}
            >
              <Smile className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleTypingInput}
              onBlur={stopTypingSignal}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  stopTypingSignal();
                  handleSend();
                }
              }}
              placeholder={t("group.thread.messagePlaceholder", { name: groupName })}
              rows={1}
              enterKeyHint="send"
              aria-label={t("group.thread.messagePlaceholder", { name: groupName })}
              className="min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-zrp-red focus:ring-2 focus:ring-zrp-red/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
              style={{ maxHeight: "128px" }}
            />

            {newMessage.trim() ? (
              <button
                type="submit"
                disabled={sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zrp-red text-white shadow-sm transition hover:bg-zrp-darkRed disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t("chat.sendMessageAria")}
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploadingImage}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zrp-red text-white shadow-sm transition hover:bg-zrp-darkRed disabled:opacity-50"
                title={t("chat.recordVoiceMessage")}
                aria-label={t("chat.recordVoiceMessage")}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </form>

      {/* EMOJI PICKER */}
      {showEmojiPicker && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setShowEmojiPicker(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zrp-deepBlack sm:rounded-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("chat.addEmoji")}</span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={t("chat.closeEmojiPickerAria")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" height={380} />
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={closeLightbox}
        >
          <div
            className="relative flex h-full max-h-[92vh] w-full max-w-5xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={lightboxImage} alt="Full size" className="max-h-full max-w-full rounded-lg object-contain" />
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:right-2 sm:top-2"
              aria-label={t("chat.closeImageAria")}
            >
              <X className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={downloadImage}
              className="absolute bottom-2 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-zrp-red text-white shadow-lg transition hover:bg-zrp-darkRed sm:bottom-4 sm:right-2"
              title={t("chat.downloadImage")}
              aria-label={t("chat.downloadImage")}
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* GROUP INFO */}
      {showInfoPanel && userId && (
        <GroupInfoPanel
          conversation={conversation}
          currentUserId={userId}
          onClose={() => setShowInfoPanel(false)}
          onUpdated={(updated) => setConversation(updated)}
          onLeft={() => {
            setShowInfoPanel(false);
            onLeftGroup?.();
          }}
        />
      )}

      {pendingDeleteId && (
        <ConfirmModal
          title={t("chat.deleteMessage")}
          body={t("chat.deleteMessageConfirm")}
          confirmLabel={t("action.delete")}
          cancelLabel={t("action.cancel")}
          destructive
          busy={deletingMessageId === pendingDeleteId}
          onConfirm={confirmPendingDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {deleteError && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {deleteError}
        </div>
      )}
    </div>
  );
}
