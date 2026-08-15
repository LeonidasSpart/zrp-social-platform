"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PostCard from "@/components/PostCard";
import CommentItem from "@/components/CommentItem";
import { useLanguage } from "@/contexts/LanguageContext";

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
  _count: {
    likes: number;
    comments: number;
    reposts: number;
    quotedBy: number;
  };
  liked?: boolean;
  commentsEnabled?: boolean; // ✅ added
}

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  postId: string;
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
    reposts: number;
    bookmarks: number;
  };
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
}

export default function PostPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "relevant" | "likes">("recent");
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
      if (!res.ok) throw new Error(t("postDetail.postNotFound"));
      const data = await res.json();
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("postDetail.errLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      // This page shows the full conversation (and supports deep-linking to
      // any comment via #comment-id + scroll-into-view), so it pages through
      // every batch internally rather than only loading the first page -
      // unlike the inline Comments widget used in feed cards, which stays
      // paginated with a "Show more" button.
      let all: Comment[] = [];
      let cursor: string | null = null;
      while (true) {
        const url: string = cursor
          ? `/api/posts/${params.id}/comments?limit=50&cursor=${cursor}`
          : `/api/posts/${params.id}/comments?limit=50`;
        const res = await fetch(url);
        if (!res.ok) break;
        const data = await res.json();
        all = [...all, ...(data.comments || [])];
        cursor = data.nextCursor || null;
        if (!cursor) break;
      }
      setComments(all);
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
              likes: prev._count.likes,
              comments: prev._count.comments + 1,
              reposts: prev._count.reposts,
              quotedBy: prev._count.quotedBy,
            },
          };
        });
      } else {
        const err = await res.json();
        alert(err.error || t("postDetail.errPostComment"));
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      alert(t("postDetail.errPostCommentGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Sort comments ────────────────────────────────────────────────
  const sortedComments = useMemo(() => {
    const sortFn = (a: Comment, b: Comment) => {
      if (sortBy === "recent") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === "likes") {
        return (b._count?.likes || 0) - (a._count?.likes || 0);
      } else { // relevant
        const scoreA = (a._count?.likes || 0) + (a.replies?.length || 0);
        const scoreB = (b._count?.likes || 0) + (b.replies?.length || 0);
        return scoreB - scoreA;
      }
    };
    return [...comments].sort(sortFn);
  }, [comments, sortBy]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("action.loading")}</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">{error || t("postDetail.postNotFound")}</p>
          <Link href="/" className="text-zrp-red hover:underline text-sm mt-2 block">
            {t("postDetail.backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  const commentsEnabled = post.commentsEnabled !== false;

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t("postDetail.backToFeed")}
        </Link>
      </div>

      <PostCard post={post} onUpdate={fetchPost} showInlineComments={false} />

      {commentsEnabled ? (
        <>
          {/* ─── Comment Composer ────────────────────────────────────── */}
          {session && (
            <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder={parentId ? t("postDetail.replyPlaceholder") : t("postDetail.commentPlaceholder")}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <button
                type="submit"
                disabled={submitting || !commentContent.trim()}
                className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                {submitting ? t("postDetail.sending") : t("postDetail.reply")}
              </button>
            </form>
          )}

          {/* ─── Reply sorting ────────────────────────────────────────── */}
          {comments.length > 0 && (
            <div className="flex items-center justify-between mt-6">
              <span className="text-sm text-gray-500">{t("postDetail.repliesCount", { n: comments.length })}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
              >
                <option value="recent">{t("postDetail.sortRecent")}</option>
                <option value="relevant">{t("postDetail.sortRelevant")}</option>
                <option value="likes">{t("postDetail.sortLikes")}</option>
              </select>
            </div>
          )}

          {/* ─── Comments (threaded) ────────────────────────────────────── */}
          {sortedComments.length > 0 && (
            <div className="mt-4 space-y-4">
              {sortedComments.map((comment) => (
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
        </>
      ) : (
        <div className="mt-6 text-center py-8 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm">{t("postDetail.commentsDisabled")}</p>
        </div>
      )}
    </div>
  );
}
