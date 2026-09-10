"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle, Users, UserPlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import NewGroupModal from "@/components/NewGroupModal";
import { useConversationList } from "@/lib/useConversationList";
import { buildMessagePreview } from "@/lib/conversationPreview";
import { usePresence } from "@/contexts/PresenceContext";

const localeMap: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
};

export default function MessagesIndexPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { conversations, loading, refresh } = useConversationList();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const { isOnline, requestStatus } = usePresence();

  // Real presence for every visible 1:1 partner - see PresenceContext's
  // own KDoc on why requestStatus is safe to call repeatedly (it only
  // ever asks once per userId, then trusts the live broadcast after).
  // Group rows show a member-count chip instead of a single presence
  // dot, since a group has many participants, not one partner.
  useEffect(() => {
    conversations.forEach((conv) => {
      if (conv.type === "direct") requestStatus(conv.partner.id);
    });
  }, [conversations, requestStatus]);

  const formatLastMessageDate = (date: string) => {
    try {
      const messageDate = new Date(date);

      if (Number.isNaN(messageDate.getTime())) {
        return "";
      }

      const now = new Date();

      const sameDay =
        messageDate.getFullYear() === now.getFullYear() &&
        messageDate.getMonth() === now.getMonth() &&
        messageDate.getDate() === now.getDate();

      if (sameDay) {
        return messageDate.toLocaleTimeString(
          localeMap[language] || "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        );
      }

      return messageDate.toLocaleDateString(
        localeMap[language] || "en-US",
        {
          month: "short",
          day: "numeric",
        }
      );
    } catch {
      return "";
    }
  };

  /*
   * Mobile / tablet
   *
   * The desktop messages layout normally has its own persistent
   * conversation sidebar. On smaller screens this page becomes
   * the conversation list - now a unified list of both real 1:1 and
   * real GROUP conversations, sorted by most recent activity.
   */
  return (
    <div
      className="
        flex
        flex-col
        w-full
        min-h-0
        h-full
        bg-white
        dark:bg-zrp-deepBlack
      "
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          MOBILE / TABLET
         ───────────────────────────────────────────────────────────── */}
      <section className="lg:hidden flex flex-col min-h-0 flex-1">
        {/* Header */}
        <header
          className="
            flex
            items-center
            justify-between
            flex-shrink-0
            px-4
            pt-4
            pb-3
            border-b
            border-gray-200
            dark:border-gray-800
          "
        >
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t("messages.title")}
            </h1>

            {conversations.length > 0 && !loading && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {conversations.length}{" "}
                {conversations.length === 1
                  ? "conversation"
                  : "conversations"}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-zrp-red dark:text-gray-400 dark:hover:bg-gray-800 transition flex-shrink-0"
            title={t("group.new")}
            aria-label={t("group.new")}
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </header>

        {/* Conversation list */}
        <div
          className="
            flex-1
            min-h-0
            overflow-y-auto
            overscroll-contain
            px-2
            py-2
          "
          style={{
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="w-6 h-6 animate-spin text-zrp-red"
                aria-label={t("messages.title")}
              />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-6 py-20">
              <div
                className="
                  w-16
                  h-16
                  rounded-full
                  bg-gray-100
                  dark:bg-gray-800
                  flex
                  items-center
                  justify-center
                  mb-4
                "
              >
                <MessageCircle
                  className="w-8 h-8 text-gray-400 dark:text-gray-500"
                />
              </div>

              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("messages.noMessagesYet")}
              </p>

              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Start a conversation to see it here.
              </p>
            </div>
          ) : (
            <div className="space-y-1 pb-3">
              {conversations.map((conv) => {
                if (conv.type === "direct") {
                  const partner = conv.partner;
                  const lastMsg = conv.lastMessage;
                  const preview = buildMessagePreview({
                    isGroup: false,
                    isOwnMessage: lastMsg.senderId === session?.user?.id,
                    senderName: "",
                    content: lastMsg.content,
                  });
                  const displayName = partner.name || partner.username;
                  const initial = displayName?.trim()?.[0]?.toUpperCase() || "?";

                  return (
                    <Link
                      key={conv.key}
                      href={conv.href}
                      className="
                        flex
                        items-center
                        gap-3
                        w-full
                        min-h-[72px]
                        px-3
                        py-2.5
                        rounded-xl
                        transition-colors
                        active:bg-gray-100
                        dark:active:bg-gray-800
                        hover:bg-gray-50
                        dark:hover:bg-gray-800/70
                        focus:outline-none
                        focus-visible:ring-2
                        focus-visible:ring-zrp-red
                      "
                    >
                      {/* Two boxes, not one. The clipping container has
                          to be rounded-full + overflow-hidden to crop the
                          avatar image into a circle - but the presence dot
                          used to live inside it, at the bounding box's
                          bottom-right corner, which is the point furthest
                          OUTSIDE a circular mask. The circle sliced the dot
                          (and its contrasting ring) into a green crescent,
                          which is what it renders as on a real device.
                          Positioning off an unclipped wrapper leaves the
                          image cropped and the dot whole. */}
                      <div className="relative w-12 h-12 sm:w-13 sm:h-13 flex-shrink-0">
                        <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          {partner.avatarUrl ? (
                            <img
                              src={partner.avatarUrl}
                              alt={displayName}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                              {initial}
                            </div>
                          )}
                        </div>

                        {/* Real presence dot - takes priority over the
                            corner when both would render there, since the
                            unread badge is a full pill with a count near
                            the row's edge and won't collide with an
                            avatar-corner dot. */}
                        {isOnline(partner.id) && (
                          <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-zrp-deepBlack" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="flex items-center gap-1 min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-white">
                            <span className="truncate">{displayName}</span>
                            <VerifiedBadge badgeType={partner.badgeType} className="flex-shrink-0" />
                          </p>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                            {formatLastMessageDate(lastMsg.createdAt)}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          @{partner.username}
                        </p>

                        <p
                          className={`text-xs truncate mt-0.5 pr-1 ${
                            conv.unreadCount > 0
                              ? "font-semibold text-gray-800 dark:text-gray-200"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {preview.kind === "own" ? t("messages.you", { msg: preview.content }) : preview.content}
                        </p>
                      </div>

                      {conv.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-zrp-red text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </Link>
                  );
                }

                // ─── Group row ────────────────────────────────────────
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
                    className="
                      flex
                      items-center
                      gap-3
                      w-full
                      min-h-[72px]
                      px-3
                      py-2.5
                      rounded-xl
                      transition-colors
                      active:bg-gray-100
                      dark:active:bg-gray-800
                      hover:bg-gray-50
                      dark:hover:bg-gray-800/70
                      focus:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-zrp-red
                    "
                  >
                    <div className="relative w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-zrp-red/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {conv.avatarUrl ? (
                        <img src={conv.avatarUrl} alt={conv.name || ""} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Users className="w-6 h-6 text-zrp-red" />
                      )}

                      {conv.unreadCount > 0 && (
                        <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full bg-zrp-red border-2 border-white dark:border-zrp-deepBlack" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {conv.name || t("group.new")}
                        </p>
                        {lastMsg && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                            {formatLastMessageDate(lastMsg.createdAt)}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {t("group.memberCount", { count: conv.participantCount })}
                      </p>

                      <p
                        className={`text-xs truncate mt-0.5 pr-1 ${
                          conv.unreadCount > 0
                            ? "font-semibold text-gray-800 dark:text-gray-200"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {preview
                          ? preview.kind === "own"
                            ? t("messages.you", { msg: preview.content })
                            : preview.kind === "fromSender"
                              ? t("group.lastMessagePrefix", { name: preview.senderName, msg: preview.content })
                              : preview.content
                          : ""}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-zrp-red text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          DESKTOP
         ───────────────────────────────────────────────────────────── */}

      <section
        className="
          hidden
          lg:flex
          flex-1
          min-h-0
          items-center
          justify-center
          text-gray-400
          dark:text-gray-500
        "
      >
        <div className="text-center px-6">
          <div
            className="
              w-20
              h-20
              rounded-full
              bg-gray-100
              dark:bg-gray-800
              flex
              items-center
              justify-center
              mx-auto
              mb-5
            "
          >
            <MessageCircle
              className="
                w-10
                h-10
                text-gray-300
                dark:text-gray-600
              "
            />
          </div>

          <p
            className="
              text-lg
              font-semibold
              text-gray-700
              dark:text-gray-300
            "
          >
            {t("messages.title")}
          </p>

          <p className="text-sm mt-1 text-gray-400 dark:text-gray-500">
            Select a conversation to start chatting.
          </p>
        </div>
      </section>

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
