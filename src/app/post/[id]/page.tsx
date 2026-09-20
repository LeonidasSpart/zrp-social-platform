"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo, use } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, FileImage, Loader2, X } from "lucide-react";
import PostCard from "@/components/PostCard";
import CommentItem from "@/components/CommentItem";
import GifPicker from "@/components/GifPicker";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import { uploadFiles } from "@/lib/uploadthing-client";

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

export default function PostPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
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
  const inputRef = useAutoGrowTextarea(commentContent);

  // ─── Attach an image or GIF to a comment ────────────────────────────
  // Comment.imageUrl already existed in the schema and was already
  // rendered by every comment surface (CommentItem.tsx) - no composer
  // anywhere ever wrote to it. This is the first one that does.
  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachError(null);
    setUploadingAttachment(true);
    try {
      const result = await uploadFiles("commentImage", { files: [file] });
      if (!result || result.length === 0) throw new Error("No file returned from upload");
      setAttachedImageUrl(result[0].ufsUrl);
    } catch (err) {
      console.error("Comment image upload error:", err);
      setAttachError(t("comment.attachmentUploadFailed"));
    } finally {
      setUploadingAttachment(false);
      if (attachmentFileInputRef.current) attachmentFileInputRef.current.value = "";
    }
  };

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

  // ─── Scroll to comment from ?commentId= ────────────────────────────
  // The one cross-platform target format: also what comment/reply push
  // notifications carry and what Android's and iOS's native deep-link
  // matchers pattern against, unlike a #hash fragment which only this
  // tab's own JS ever sees.
  //
  // Reads the DOM directly rather than a ref map kept by this component:
  // a ref map populated only in this page's own top-level .map() never
  // covered a reply (replies render recursively inside CommentItem, one
  // level removed from this page), so a notification/share link
  // pointing at a reply silently failed to scroll to anything.
  // CommentItem's own root element now carries id={`comment-${id}`} at
  // every depth, so getElementById reaches a reply exactly the same way
  // it reaches a top-level comment.
  useEffect(() => {
    if (comments.length === 0) return;

    const commentId = new URLSearchParams(window.location.search).get("commentId");
    if (commentId) {
      const element = document.getElementById(`comment-${commentId}`);
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
  const submitComment = async () => {
    if ((!commentContent.trim() && !attachedImageUrl) || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${params.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentContent,
          parentId: parentId || undefined,
          imageUrl: attachedImageUrl || undefined,
        }),
      });
      if (res.ok) {
        setCommentContent("");
        setParentId(null);
        setAttachedImageUrl(null);
        setAttachError(null);
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
        alert(localizeApiMessage(err.error, t) || t("postDetail.errPostComment"));
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      alert(t("postDetail.errPostCommentGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    submitComment();
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
          <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" /> {t("postDetail.backToFeed")}
        </Link>
      </div>

      <PostCard post={post} onUpdate={fetchPost} showInlineComments={false} />

      {commentsEnabled ? (
        <>
          {/* ─── Comment Composer ────────────────────────────────────── */}
          {session && (
            <form onSubmit={handleSubmitComment} className="mt-4">
              {attachedImageUrl && (
                <div className="relative mb-2 inline-block">
                  <img
                    src={attachedImageUrl}
                    alt=""
                    className="max-h-40 rounded-xl border border-gray-200 dark:border-gray-700 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachedImageUrl(null)}
                    aria-label={t("comment.removeAttachment")}
                    className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-black/70 text-white hover:bg-black/90 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {attachError && (
                <p role="alert" aria-live="polite" className="text-xs text-red-500 mb-1">
                  {attachError}
                </p>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder={parentId ? t("postDetail.replyPlaceholder") : t("postDetail.commentPlaceholder")}
                  aria-label={parentId ? t("postDetail.replyPlaceholder") : t("postDetail.commentPlaceholder")}
                  rows={2}
                  // This was previously a single-line <input> - a comment
                  // of any real length scrolled horizontally out of view
                  // as you typed, with no way to see or review it before
                  // posting (the exact complaint this fixes). text-base
                  // (16px) also avoids iOS Safari's auto-zoom-on-focus for
                  // any input under 16px, which was its own contributor to
                  // "hard to see what I'm typing" on mobile.
                  className="flex-1 min-w-0 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-base resize-none overflow-y-auto max-h-52"
                />

                <label
                  className={`flex-shrink-0 p-2 transition ${
                    uploadingAttachment || !!attachedImageUrl
                      ? "cursor-not-allowed opacity-40"
                      : "cursor-pointer text-gray-500 dark:text-gray-400 hover:text-zrp-red"
                  }`}
                  title={t("comment.addImage")}
                >
                  <input
                    ref={attachmentFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAttachmentFileChange}
                    disabled={uploadingAttachment || !!attachedImageUrl}
                    className="hidden"
                  />
                  {uploadingAttachment ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </label>

                <button
                  type="button"
                  onClick={() => setShowGifPicker(true)}
                  disabled={uploadingAttachment || !!attachedImageUrl}
                  title={t("composer.addGif")}
                  className="flex-shrink-0 p-2 text-gray-500 dark:text-gray-400 hover:text-zrp-red disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <FileImage className="w-5 h-5" />
                </button>

                <button
                  type="submit"
                  disabled={submitting || (!commentContent.trim() && !attachedImageUrl)}
                  className="flex-shrink-0 px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
                >
                  {submitting ? t("postDetail.sending") : t("postDetail.reply")}
                </button>
              </div>
            </form>
          )}

          {showGifPicker && (
            <GifPicker
              onSelect={(url) => {
                setAttachedImageUrl(url);
                setShowGifPicker(false);
              }}
              onClose={() => setShowGifPicker(false)}
            />
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
                // No wrapper div needed for the scroll/highlight target -
                // CommentItem's own root element now carries
                // id={`comment-${id}`} itself (see CommentItem.tsx),
                // which also reaches a reply nested arbitrarily deep,
                // unlike this wrapper (which only ever existed for the
                // top-level comment).
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onReply={handleReply}
                  onUpdate={fetchComments}
                />
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
