"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
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

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { t, language } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<any>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

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

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      const socket = getSocket(session.user.id);
      socketRef.current = socket;

      socket.on("conversation-deleted", ({ withUserId }: { withUserId: string }) => {
        setConversations((prev) => prev.filter((conv) => conv.partner.id !== withUserId));
      });

      fetchConversations();

      return () => {
        socket.off("conversation-deleted");
      };
    }
  }, [status, session?.user?.id]);

  // Refresh the list whenever the active conversation changes, so a newly
  // started chat (from a profile "Message" button) appears in the sidebar.
  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
    }
  }, [pathname, status]);

  if (!session) {
    return <>{children}</>;
  }

  const activeUsername = pathname?.startsWith("/messages/") ? pathname.split("/")[2] : null;

  return (
    <div className="flex w-full">
      {/* ─── Persistent conversation list (desktop only) ──────────── */}
      <aside className="hidden lg:flex flex-col w-80 flex-shrink-0 h-screen sticky top-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white px-4 pt-4 pb-2">
          {t("messages.title")}
        </h1>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4 text-gray-500">
            <MessageCircle className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm">{t("messages.noMessagesYet")}</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2 pb-4">
            {conversations.map((conv) => {
              const partner = conv.partner;
              const lastMsg = conv.lastMessage;
              const isOwn = lastMsg.senderId === session?.user?.id;
              const isActive = activeUsername === partner.username;

              return (
                <Link
                  key={partner.id}
                  href={`/messages/${partner.username}`}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition ${
                    isActive
                      ? "bg-zrp-red/10"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                    {partner.avatarUrl ? (
                      <img
                        src={partner.avatarUrl}
                        alt={partner.name || partner.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                        {(partner.name || partner.username)[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${isActive ? "font-bold" : "font-semibold"} text-gray-900 dark:text-white`}>
                        {partner.name || partner.username}
                      </p>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {new Date(lastMsg.createdAt).toLocaleDateString(localeMap[language] || "en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {isOwn ? t("messages.you", { msg: lastMsg.content }) : lastMsg.content}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="bg-zrp-red text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      {/* ─── Right pane: list on mobile, chat/empty-state on desktop ─── */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
