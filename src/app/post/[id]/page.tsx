"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PostCard from "@/components/PostCard";
import CommentItem from "@/components/CommentItem";

interface Post {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
    badgeType?: string | null;
  };
  _count?: {
    likes: number;
    comments: number;
    reposts: number;
  };
  liked?: boolean;
}

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  parentId?: string;
  replies?: Comment[];
  _count?: {
    likes: number;
  };
  liked?: boolean;
}

export default function PostPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchPost();
    }
  }, [params.id, session]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/posts/${params.id}`);
      if (!res.ok) throw new Error("Post not found");
      const data = await res.json();
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/posts/${params.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  useEffect(() => {
    if (post) {
      fetchComments();
    }
  }, [post]);

  // ─── Scroll to comment from URL hash ──────────────────────────────
  useEffect(() => {
    if (comments.length === 0) return;

    const hash = window.location.hash;
    if (hash.startsWith("#comment-")) {
      const commentId = hash.replace("#comment-", "");
      const element = commentRefs.current[commentId];
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.style.transition = "background-color 0.5s";
          element.style.backgroundColor = "rgba(255, 45, 45, 0.1)";
          setTimeout(() => {
            element.style.backgroundColor = "transparent";
          }, 2000);
        }, 300);
      }
    }
  }, [comments]);

  // ─── Handle reply ──────────────────────────────────────────────────
  const handleReply = (commentId: string) => {
    setParentId(commentId);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // ─── Submit comment ──────────────────────────────────────────────
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim() || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${params.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentContent,
          parentId: parentId || undefined,
        }),
      });
      if (res.ok) {
        setCommentContent("");
        setParentId(null);
        fetchComments();
        // Update post comment count
        setPost((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            _count: {
              likes: prev._count?.likes ?? 0,
              comments: (prev._count?.comments ?? 0) + 1,
              reposts: prev._count?.reposts ?? 0,
            },
          };
        });
      } else {
        const err = await res.json();
        alert(err.error || "Failed to post comment");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      alert("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">{error || "Post not found"}</p>
          <Link href="/" className="text-zrp-red hover:underline text-sm mt-2 block">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to feed
        </Link>
      </div>

      <PostCard post={post} onUpdate={fetchPost} showInlineComments={false} />

      {/* ─── Comment Composer ────────────────────────────────────── */}
      {session && (
        <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
            placeholder={parentId ? "Write a reply..." : "Write a comment..."}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
          <button
            type="submit"
            disabled={submitting || !commentContent.trim()}
            className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
          >
            {submitting ? "Sending..." : "Reply"}
          </button>
        </form>
      )}

      {/* ─── Comments (threaded) ────────────────────────────────────── */}
      {comments.length > 0 && (
        <div className="mt-6 space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              ref={(el) => {
                commentRefs.current[comment.id] = el;
              }}
              id={`comment-${comment.id}`}
              className="rounded-lg transition-colors duration-500"
            >
              <CommentItem
                comment={comment}
                onReply={handleReply}
                onUpdate={fetchComments}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
