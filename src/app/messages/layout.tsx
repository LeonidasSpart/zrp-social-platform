"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle, Users, UserPlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import NewGroupModal from "@/components/NewGroupModal";
import { useConversationList } from "@/lib/useConversationList";
import { buildMessagePreview } from "@/lib/conversationPreview";
import { usePresence } from "@/contexts/PresenceContext";
import { useSession } from "next-auth/react";

const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { conversations, loading, refresh } = useConversationList();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const { isOnline, requestStatus } = usePresence();

  // Real presence for every visible 1:1 partner - requestStatus is a
  // one-time-per-userId backfill (see PresenceContext's own KDoc);
  // group rows show a member-count chip instead of a single presence
  // dot, since a group has many participants, not one partner.
  useEffect(() => {
    conversations.forEach((conv) => {
      if (conv.type === "direct") requestStatus(conv.partner.id);
    });
  }, [conversations, requestStatus]);

  if (!session) {
    return <>{children}</>;
  }

  const activeUsername = pathname?.startsWith("/messages/") && !pathname.startsWith("/messages/group/")
    ? pathname.split("/")[2]
    : null;
  const activeGroupId = pathname?.startsWith("/messages/group/") ? pathname.split("/")[3] : null;

  return (
    <div className="flex w-full">
      {/* ─── Persistent conversation list (desktop only) ──────────── */}
      <aside className="hidden lg:flex flex-col w-80 flex-shrink-0 h-screen sticky top-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
        {/* h2, not h1: this aside is the persistent conversation list
            beside the page, and messages/page.tsx already provides the
            document's h1. At lg and above both were rendered and both
            were visible, so the word "Messages" appeared twice as a
            top-level heading in adjacent columns. */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t("messages.title")}
          </h2>
          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-zrp-red dark:text-gray-400 dark:hover:bg-gray-800 transition"
            title={t("group.new")}
            aria-label={t("group.new")}
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

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
              if (conv.type === "direct") {
                const partner = conv.partner;
                const lastMsg = conv.lastMessage;
                const isActive = activeUsername === partner.username;
                const preview = buildMessagePreview({
                  isGroup: false,
                  isOwnMessage: lastMsg.senderId === session?.user?.id,
                  senderName: "",
                  content: lastMsg.content,
                });

                return (
                  <Link
                    key={conv.key}
                    href={conv.href}
                    className={`flex items-center gap-3 p-2.5 rounded-lg transition ${
                      isActive ? "bg-zrp-red/10" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="relative w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
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
                      {isOnline(partner.id) && (
                        <span
                          className="absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-zrp-deepBlack"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${isActive ? "font-bold" : "font-semibold"} text-gray-900 dark:text-white flex items-center gap-1`}>
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
                        {preview.kind === "own" ? t("messages.you", { msg: preview.content }) : preview.content}
                      </p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-zrp-red text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </Link>
                );
              }

              // ─── Group row: visually distinct via a group-icon badge
              // instead of a person's initials/photo (no participant
              // photo list to composite a stacked avatar from - the
              // group list summary only carries the group's own
              // avatarUrl, not its members'), the group's own name, and
              // a member count instead of a single partner. ───────────
              const isActive = activeGroupId === conv.id;
              const lastMsg = conv.lastMessage;
              const preview = lastMsg
                ? buildMessagePreview({
                    isGroup: true,
                    isOwnMessage: lastMsg.senderId === session?.user?.id,
                    senderName: lastMsg.sender.name || lastMsg.sender.username,
                    content: lastMsg.content,
                  })
                : null;

              return (
                <Link
                  key={conv.key}
                  href={conv.href}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition ${
                    isActive ? "bg-zrp-red/10" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-full bg-zrp-red/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {conv.avatarUrl ? (
                      <img src={conv.avatarUrl} alt={conv.name || ""} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-zrp-red" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${isActive ? "font-bold" : "font-semibold"} text-gray-900 dark:text-white`}>
                        {conv.name || t("group.new")}
                      </p>
                      {lastMsg && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {new Date(lastMsg.createdAt).toLocaleDateString(localeMap[language] || "en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {preview
                        ? preview.kind === "own"
                          ? t("messages.you", { msg: preview.content })
                          : preview.kind === "fromSender"
                            ? t("group.lastMessagePrefix", { name: preview.senderName, msg: preview.content })
                            : preview.content
                        : t("group.memberCount", { count: conv.participantCount })}
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

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            setShowNewGroup(false);
            refresh();
            router.push(`/messages/group/${id}`);
          }}
        />
      )}
    </div>
  );
}
