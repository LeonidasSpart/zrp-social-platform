"use client";

import { useRef, useState, useId } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import VerifiedBadge from "./VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import { getPlanLimits } from "@/lib/limits";

interface Props {
  post: {
    id: string;
    content: string;
    imageUrl?: string;
    author: {
      name: string;
      username: string;
      avatarUrl?: string;
      badgeType?: string | null;
    };
  };
  onClose: () => void;
  onQuotePosted: () => void;
}

export default function QuotePostModal({ post, onClose, onQuotePosted }: Props) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const titleId = useId();
  const dialogRef = useDialogA11y(true, onClose, !loading);

  useBodyScrollLock(true);

  const postLength = getPlanLimits(session?.user?.plan || "free").postLength;

  // Auto-grows with content instead of a fixed rows={4} box, the same
  // pattern PostComposer already uses - capped so a very long quote
  // still scrolls internally rather than pushing the Publish button
  // off-screen.
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value.slice(0, postLength));
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
  };

  const handleQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    // Defense-in-depth against a double-submit beyond the button's own
    // disabled state, matching PostComposer's handleSubmit guard.
    if (loading || !content.trim() || !session) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          quotePostId: post.id,
          status: "published",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        // /api/posts refuses a quote of a private account's, scheduled
        // or blocked-relationship post with this one English sentence
        // (400) - surface it in the viewer's language instead of raw.
        if (
          typeof data?.error === "string" &&
          /can't be quoted/i.test(data.error)
        ) {
          throw new Error(t("quote.errCannotQuote"));
        }
        throw new Error(localizeApiMessage(data?.error, t) || t("quote.errGeneric"));
      }
      onQuotePosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("quote.errGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      {/*
        Root cause of the original bug: this whole modal was one single
        `overflow-y-auto` block (preview + textarea + buttons together)
        sized with plain `90vh`, so on mobile the on-screen keyboard
        shrinking the visual viewport could push the Publish button
        below the fold with no sticky footer to keep it reachable, and
        the fixed rows={4} textarea couldn't grow to show what was
        typed. Restructured as a flex column with a shrink-0 header, a
        flex-1 scrollable middle (original-post preview + composer),
        and a shrink-0 footer that always stays visible - the same
        header/scroll-body/footer shape CategoryPickerModal already
        uses for its own bottom-sheet-on-mobile pattern - plus `dvh`
        (not `vh`) so the box's own max height already tracks the
        visual viewport in browsers that support it, and an explicit
        safe-area-inset-bottom pad on the footer for the home indicator.
      */}
      <div className="focus:outline-none bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[100dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-white">{t("quote.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("help.close")}
            className="-me-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleQuote} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6">
            {/* ─── Original post preview ────────────────────────────── */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <Link href={`/profile/${post.author.username}`} className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    {post.author.avatarUrl ? (
                      <img
                        src={post.author.avatarUrl}
                        alt={post.author.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                        {post.author.name[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/profile/${post.author.username}`}
                      className="font-semibold text-gray-900 dark:text-white text-sm hover:underline truncate"
                    >
                      {post.author.name}
                    </Link>
                    <VerifiedBadge badgeType={post.author.badgeType} />
                    <Link
                      href={`/profile/${post.author.username}`}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      <bdi>@{post.author.username}</bdi>
                    </Link>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap">
                    {post.content}
                  </p>
                  {post.imageUrl && (
                    <div className="mt-2 rounded-lg overflow-hidden max-h-40">
                      <img
                        src={post.imageUrl}
                        alt="Quoted post image"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Quote composer ────────────────────────────────────── */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder={t("quote.thoughtsPlaceholder")}
              className="w-full resize-none border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent overflow-y-auto"
              style={{ minHeight: "90px", maxHeight: "240px" }}
              autoFocus
            />
          </div>

          <div
            className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {content.length}/{postLength}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {t("action.cancel")}
              </button>
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                {loading ? t("quote.submitting") : t("quote.submit")}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-red-500 text-sm px-6 pb-4 flex-shrink-0" role="alert" aria-live="polite">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
