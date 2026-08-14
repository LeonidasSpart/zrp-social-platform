"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import VerifiedBadge from "./VerifiedBadge";
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
  const { data: session } = useSession();
  const plan = (session?.user?.plan as any) || "free";
  const limits = getPlanLimits(plan);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !session) return;

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
        const data = await res.json();
        throw new Error(data.error || "Failed to quote");
      }
      onQuotePosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zrp-deepBlack rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Quote Post</h2>

        {/* ─── Original post preview ────────────────────────────────── */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
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
            <div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">
                  {post.author.name}
                </span>
                <VerifiedBadge badgeType={post.author.badgeType} />
                <span className="text-xs text-gray-500">@{post.author.username}</span>
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

        {/* ─── Quote composer ────────────────────────────────────────── */}
        <form onSubmit={handleQuote}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add your thoughts..."
            className="w-full resize-none border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
            rows={4}
            maxLength={limits.postLength}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {content.length}/{limits.postLength}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                {loading ? "Posting..." : "Quote"}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>
      </div>
    </div>
  );
}
