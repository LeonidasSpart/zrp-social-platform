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

  const localeMap: Record<string, string> = {
    en: "en-US",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
  };

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const fetchConversations = async () => {
      try {
        const res = await fetch("/api/messages", {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch conversations");
        }

        const data = await res.json();

        if (!cancelled) {
          setConversations(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching conversations:", error);
          setConversations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchConversations();

    return () => {
      cancelled = true;
    };
  }, [status]);

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

  const getLastMessagePreview = (
    content: string,
    isOwn: boolean
  ) => {
    const value = content?.trim() || "";

    if (!value) {
      return isOwn
        ? t("messages.you", { msg: "" })
        : "";
    }

    return isOwn
      ? t("messages.you", { msg: value })
      : value;
  };

  /*
   * Mobile / tablet
   *
   * The desktop messages layout normally has its own persistent
   * conversation sidebar. On smaller screens this page becomes
   * the conversation list.
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
                const partner = conv.partner;
                const lastMsg = conv.lastMessage;

                const isOwn =
                  lastMsg.senderId === session?.user?.id;

                const displayName =
                  partner.name || partner.username;

                const initial =
                  displayName?.trim()?.[0]?.toUpperCase() || "?";

                return (
                  <Link
                    key={partner.id}
                    href={`/messages/${partner.username}`}
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
                    {/* Avatar */}
                    <div
                      className="
                        relative
                        w-12
                        h-12
                        sm:w-13
                        sm:h-13
                        rounded-full
                        bg-gray-200
                        dark:bg-gray-700
                        overflow-hidden
                        flex-shrink-0
                      "
                    >
                      {partner.avatarUrl ? (
                        <img
                          src={partner.avatarUrl}
                          alt={displayName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="
                            w-full
                            h-full
                            flex
                            items-center
                            justify-center
                            text-gray-600
                            dark:text-gray-300
                            font-bold
                            text-sm
                          "
                        >
                          {initial}
                        </div>
                      )}

                      {/* Unread indicator */}
                      {conv.unreadCount > 0 && (
                        <span
                          className="
                            absolute
                            right-0
                            bottom-0
                            w-3
                            h-3
                            rounded-full
                            bg-zrp-red
                            border-2
                            border-white
                            dark:border-zrp-deepBlack
                          "
                        />
                      )}
                    </div>

                    {/* Conversation content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + date */}
                      <div className="flex items-center gap-2 min-w-0">
                        <p
                          className="
                            flex
                            items-center
                            gap-1
                            min-w-0
                            flex-1
                            text-sm
                            font-semibold
                            text-gray-900
                            dark:text-white
                          "
                        >
                          <span className="truncate">
                            {displayName}
                          </span>

                          <VerifiedBadge
                            badgeType={partner.badgeType}
                            className="flex-shrink-0"
                          />
                        </p>

                        <span
                          className="
                            text-[11px]
                            text-gray-400
                            dark:text-gray-500
                            flex-shrink-0
                          "
                        >
                          {formatLastMessageDate(
                            lastMsg.createdAt
                          )}
                        </span>
                      </div>

                      {/* Username */}
                      <p
                        className="
                          text-[11px]
                          text-gray-400
                          dark:text-gray-500
                          truncate
                          mt-0.5
                        "
                      >
                        @{partner.username}
                      </p>

                      {/* Last message */}
                      <p
                        className={`
                          text-xs
                          truncate
                          mt-0.5
                          pr-1
                          ${
                            conv.unreadCount > 0
                              ? "font-semibold text-gray-800 dark:text-gray-200"
                              : "text-gray-500 dark:text-gray-400"
                          }
                        `}
                      >
                        {getLastMessagePreview(
                          lastMsg.content,
                          isOwn
                        )}
                      </p>
                    </div>

                    {/* Unread count */}
                    {conv.unreadCount > 0 && (
                      <span
                        className="
                          flex-shrink-0
                          min-w-[20px]
                          h-5
                          px-1.5
                          rounded-full
                          bg-zrp-red
                          text-white
                          text-[10px]
                          font-bold
                          flex
                          items-center
                          justify-center
                        "
                      >
                        {conv.unreadCount > 99
                          ? "99+"
                          : conv.unreadCount}
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
    </div>
  );
}
