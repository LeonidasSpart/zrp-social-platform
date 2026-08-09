"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";

interface Conversation {
  partner: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

export default function MessagesIndexPage() {
  const { data: session, status } = useSession();
  const { t, language } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchConversations = async () => {
      try {
        const res = await fetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          setConversations(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Error fetching conversations:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [status]);

  return (
    <>
      {/* ─── Mobile / tablet: full conversation list ───────────────────
          The persistent sidebar list in layout.tsx is desktop-only
          (hidden below lg), so this page must carry the list itself
          on smaller screens. ──────────────────────────────────────── */}
      <div className="lg:hidden">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white px-4 pt-4 pb-2">
          {t("messages.title")}
        </h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 px-4 text-gray-500">
            <MessageCircle className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm">{t("messages.noMessagesYet")}</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2 pb-4">
            {conversations.map((conv) => {
              const partner = conv.partner;
              const lastMsg = conv.lastMessage;
              const isOwn = lastMsg.senderId === session?.user?.id;

              return (
                <Link
                  key={partner.id}
                  href={`/messages/${partner.username}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg transition hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
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
                      <p className="text-sm font-semibold truncate text-gray-900 dark:text-white flex items-center gap-1">
                        <span className="truncate">{partner.name || partner.username}</span>
                        <VerifiedBadge badgeType={partner.badgeType} className="flex-shrink-0" />
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
      </div>

      {/* ─── Desktop: empty-state placeholder ───────────────────────────
          Desktop already shows the persistent list via the sidebar
          in layout.tsx, so this pane just prompts to pick a chat. ──── */}
      <div className="hidden lg:flex flex-1 items-center justify-center h-screen text-gray-400 dark:text-gray-500">
        <div className="text-center px-4">
          <MessageCircle className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-600 dark:text-gray-300">
            {t("messages.title")}
          </p>
          <p className="text-sm mt-1">Select a conversation to start chatting.</p>
        </div>
      </div>
    </>
  );
}
