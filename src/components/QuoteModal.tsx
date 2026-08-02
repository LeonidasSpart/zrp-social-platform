"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  originalPost: {
    id: string;
    content: string;
    author: {
      username: string;
      name: string | null;
      avatarUrl?: string | null;
    };
  };
  loading?: boolean; // ✅ added
}

export default function QuoteModal({
  isOpen,
  onClose,
  onSubmit,
  originalPost,
  loading = false,
}: QuoteModalProps) {
  const [content, setContent] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert("Please write something to quote.");
      return;
    }
    await onSubmit(content);
    setContent("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quote this post</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Original post preview */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">
              {originalPost.author.name || originalPost.author.username}
            </span>
            <span className="text-gray-500 dark:text-gray-400">@{originalPost.author.username}</span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mt-1 text-sm">{originalPost.content}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add your comment..."
            className="w-full p-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-zrp-red focus:border-transparent resize-none"
            rows={4}
            maxLength={500}
            autoFocus
          />
          <div className="flex justify-end gap-3 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim() || loading}
              className="px-6 py-2 bg-zrp-red text-white rounded-full text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition"
            >
              {loading ? "Posting..." : "Quote"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
