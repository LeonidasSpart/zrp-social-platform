"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const post = await res.json();
        onPostCreated(post);
        setContent("");
      }
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
            {session?.user?.name?.[0] || "?"}
          </div>
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 placeholder-gray-400 min-h-[80px]"
              maxLength={280}
            />
            <div className="flex items-center justify-between mt-2 border-t border-gray-100 pt-2">
              <span className="text-xs text-gray-400">
                {content.length}/280
              </span>
              <button
                type="submit"
                disabled={!content.trim() || loading}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
