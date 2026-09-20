"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getPostUrl } from "@/lib/postUrl";

interface SharePostModalProps {
  postId: string;
  onClose: () => void;
}

interface RecipientUser {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * "Send in Message" - reuses the exact same POST /api/messages the
 * regular conversation composer uses (ChatInterface.tsx), sending the
 * post's canonical URL as the message content. That endpoint already
 * enforces the rate limit and the bidirectional block check, and
 * ChatInterface/ConversationScreen already render a link preview for
 * any URL a message contains (LinkPreviewCard), so the recipient sees
 * a real preview of the shared post with zero new backend work.
 *
 * Recipient search reuses GET /api/search?type=users, the same
 * block/mute-aware user search the mention autocomplete uses.
 */
export default function SharePostModal({ postId, onClose }: SharePostModalProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipientUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentTo, setSentTo] = useState<Record<string, "sending" | "sent" | "error">>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?type=users&q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data.users) ? data.users : []);
        }
      } catch {
        // Search failures fail silently to an empty list - not worth a
        // dedicated error state for a debounced-as-you-type search.
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSend = async (recipient: RecipientUser) => {
    if (sentTo[recipient.id]) return;
    setSentTo((prev) => ({ ...prev, [recipient.id]: "sending" }));
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: recipient.id,
          content: getPostUrl(postId),
        }),
      });
      setSentTo((prev) => ({ ...prev, [recipient.id]: res.ok ? "sent" : "error" }));
    } catch {
      setSentTo((prev) => ({ ...prev, [recipient.id]: "error" }));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-post-modal-title"
        className="bg-white dark:bg-zrp-deepBlack rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="share-post-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {t("sharePost.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("help.close")}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition p-1 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sharePost.searchPlaceholder")}
            aria-label={t("sharePost.searchPlaceholder")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {searching && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              {t("sharePost.noResults")}
            </p>
          )}

          {!searching &&
            results.map((user) => {
              const state = sentTo[user.id];
              return (
                <button
                  key={user.id}
                  onClick={() => handleSend(user)}
                  disabled={state === "sending" || state === "sent"}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:cursor-default text-left"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {user.name || user.username}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      @{user.username}
                    </p>
                  </div>
                  <span className="shrink-0">
                    {state === "sending" && (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    )}
                    {state === "sent" && (
                      <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                        <Check className="w-4 h-4" />
                        {t("sharePost.sent")}
                      </span>
                    )}
                    {state === "error" && (
                      <span className="text-sm text-red-500">{t("sharePost.errSendFailed")}</span>
                    )}
                    {!state && (
                      <span className="text-sm font-medium text-zrp-red">{t("sharePost.send")}</span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
