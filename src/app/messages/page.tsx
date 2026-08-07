"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import { getSocket } from "@/lib/socket-client";
import { useLanguage } from "@/contexts/LanguageContext";

interface Conversation {
  partner: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingConversation, setDeletingConversation] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      const socket = getSocket(session.user.id);
      socketRef.current = socket;

      socket.on("conversation-deleted", ({ withUserId }) => {
        setConversations((prev) => prev.filter((conv) => conv.partner.id !== withUserId));
      });

      fetchConversations();

      return () => {
        socket.off("conversation-deleted");
      };
    }
  }, [status, session?.user?.id]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (userId: string) => {
    if (!confirm(t("messages.deleteConfirm"))) return;

    setDeletingConversation(userId);
    try {
      const res = await fetch(`/api/messages/conversation/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((conv) => conv.partner.id !== userId));
        socketRef.current?.emit("delete-conversation", {
          otherUserId: userId,
          senderId: session?.user?.id,
        });
      } else {
        const err = await res.json();
        alert(err.error || t("messages.errDeleteFailed"));
      }
    } catch (error) {
      console.error("Delete conversation error:", error);
      alert(t("messages.errDeleteFailed"));
    } finally {
      setDeletingConversation(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-zrp-deepBlack min-h-screen p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t("messages.title")}</h1>

      {conversations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MessageCircle className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p>{t("messages.noMessagesYet")}</p>
          <p className="text-sm">{t("messages.startConversation")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {conversations.map((conv) => {
            const partner = conv.partner;
            const lastMsg = conv.lastMessage;
            const isOwn = lastMsg.senderId === session?.user?.id;

            return (
              <div
                key={partner.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition group"
              >
                <Link
                  href={`/messages/${partner.username}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                    {partner.avatarUrl ? (
                      <img
                        src={partner.avatarUrl}
                        alt={partner.name || partner.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-lg">
                        {(partner.name || partner.username)[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {partner.name || partner.username}
                      </p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {new Date(lastMsg.createdAt).toLocaleDateString(localeMap[language] || "en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {isOwn ? t("messages.you", { msg: lastMsg.content }) : lastMsg.content}
                    </p>
                  </div>

                  {conv.unreadCount > 0 && (
                    <span className="bg-zrp-red text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </Link>

                {/* ─── DELETE BUTTON ────────────────────────────────── */}
                <button
                  onClick={() => handleDeleteConversation(partner.id)}
                  disabled={deletingConversation === partner.id}
                  className="text-gray-400 hover:text-red-500 transition p-2 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  title={t("messages.deleteConversation")}
                >
                  {deletingConversation === partner.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
