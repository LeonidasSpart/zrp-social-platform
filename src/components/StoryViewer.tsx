"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { X, Eye, Heart, Send, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ConfirmModal from "@/components/ConfirmModal";

// Mirrors MAX_MESSAGE_LENGTH in src/app/api/messages/route.ts - a story
// reply is a real DM, so it's bound by the same content limit as every
// other message rather than a new invented cap. Enforced authoritatively
// server-side either way; this only avoids a doomed request.
const MAX_REPLY_LENGTH = 10000;

interface Props {
  group: {
    user: { id: string; username: string; name: string; avatarUrl?: string };
    stories: Array<{
      id: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      viewed: boolean;
      viewCount?: number;   // ✅ now we receive it
      liked?: boolean;
      likeCount?: number;
    }>;
  };
  onClose: () => void;
  onStoryViewed: () => void;
  // Called after a successful edit or delete, so the tray/list behind
  // this viewer (StoriesBar's own `groups` state) picks up the change -
  // same refetch function StoriesBar already passes as onStoryViewed.
  onStoriesChanged: () => void;
}

export default function StoryViewer({ group, onClose, onStoryViewed, onStoriesChanged }: Props) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [burstKey, setBurstKey] = useState(0); // remounts the heart-burst animation each tap
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Replying to your own story makes no sense (there's no DM channel to
  // yourself) - the server rejects it too (see POST /api/messages), this
  // just keeps the input from ever being offered in the first place.
  const isOwnStory = !!session?.user?.id && session.user.id === group.user.id;
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);
  const replySentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (replySentTimeoutRef.current) clearTimeout(replySentTimeoutRef.current);
    };
  }, []);

  // Liked/likeCount are tracked per-story locally so switching between
  // stories in the group shows each one's own state correctly, and so
  // a like updates instantly without waiting on a refetch.
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(group.stories.map((s) => [s.id, !!s.liked]))
  );
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(group.stories.map((s) => [s.id, s.likeCount ?? 0]))
  );

  // The story list itself is also tracked locally, initialized from the
  // group prop and mutated directly on edit/delete - the same pattern as
  // likedMap/likeCountMap above. `group` is a snapshot StoriesBar handed
  // this viewer when it was opened and is never refreshed while it's
  // open, so a delete needs somewhere local to actually remove the item.
  const [stories, setStories] = useState(group.stories);

  const story = stories[currentIndex];
  const liked = likedMap[story.id] ?? false;
  const likeCount = likeCountMap[story.id] ?? 0;

  // ─── Own-story management: options menu, edit, delete ────────────────
  const [showOptions, setShowOptions] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEdit = () => {
    setShowOptions(false);
    setEditText(story.content || "");
    setEditError(null);
    setEditing(true);
    setPaused(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
    setPaused(false);
  };

  const saveEdit = async () => {
    if (savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("stories.editFailed"));
      }
      const updated = await res.json();
      setStories((prev) =>
        prev.map((s) =>
          s.id === story.id ? { ...s, content: updated.content ?? undefined } : s
        )
      );
      setEditing(false);
      setPaused(false);
      onStoriesChanged();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("stories.editFailed"));
    } finally {
      setSavingEdit(false);
    }
  };

  const requestDelete = () => {
    setShowOptions(false);
    setDeleteError(null);
    setConfirmingDelete(true);
    setPaused(true);
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeleteError(null);
    setPaused(false);
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/stories/${story.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("stories.deleteFailed"));
      }
      onStoriesChanged();
      const remaining = stories.filter((s) => s.id !== story.id);
      if (remaining.length === 0) {
        onClose();
        return;
      }
      setStories(remaining);
      setCurrentIndex((idx) => Math.min(idx, remaining.length - 1));
      setConfirmingDelete(false);
      setPaused(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("stories.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!story.viewed) {
      fetch(`/api/stories/${story.id}/view`, { method: "POST" });
      onStoryViewed();
    }
  }, [story.id]);

  useEffect(() => {
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (paused) return;
    const start = Date.now() - (progress / 100) * 5000;
    const duration = 5000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        if (currentIndex < stories.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onClose();
        }
      }
    }, 100);
    timerRef.current = interval;
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, stories.length, onClose, paused]);

  const next = () => {
    if (currentIndex < stories.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  const prev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const toggleLike = useCallback(
    async (storyId: string, showBurstOnlyWhenLiking: boolean) => {
      const wasLiked = likedMap[storyId] ?? false;
      const nextLiked = !wasLiked;

      // Optimistic update - same pattern as post/comment likes.
      setLikedMap((prev) => ({ ...prev, [storyId]: nextLiked }));
      setLikeCountMap((prev) => ({
        ...prev,
        [storyId]: Math.max(0, (prev[storyId] ?? 0) + (nextLiked ? 1 : -1)),
      }));

      if (nextLiked && showBurstOnlyWhenLiking) {
        setBurstKey((k) => k + 1);
      }

      try {
        const res = await fetch(`/api/stories/${storyId}/like`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to update like");
        const data = await res.json();
        // Reconcile with the server's actual result in case of a race
        // (e.g. rapid double-tap) rather than trusting the optimistic
        // guess indefinitely.
        setLikedMap((prev) => ({ ...prev, [storyId]: data.liked }));
      } catch {
        // Revert on failure
        setLikedMap((prev) => ({ ...prev, [storyId]: wasLiked }));
        setLikeCountMap((prev) => ({
          ...prev,
          [storyId]: Math.max(0, (prev[storyId] ?? 0) + (wasLiked ? 1 : -1)),
        }));
      }
    },
    [likedMap]
  );

  const sendReply = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = replyText.trim();
      if (!trimmed || sendingReply) return;

      setSendingReply(true);
      setReplyError(null);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverId: group.user.id,
            content: trimmed,
            storyId: story.id,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to send reply");
        }
        setReplyText("");
        setReplySent(true);
        if (replySentTimeoutRef.current) clearTimeout(replySentTimeoutRef.current);
        replySentTimeoutRef.current = setTimeout(() => setReplySent(false), 2000);
      } catch (err) {
        setReplyError(err instanceof Error ? err.message : "Failed to send reply");
      } finally {
        setSendingReply(false);
      }
    },
    [replyText, sendingReply, group.user.id, story.id]
  );

  // Double-tap-to-like on the middle third of the screen - the left and
  // right thirds are already prev/next navigation zones, so the middle
  // third is free for this without any conflict.
  const lastTapRef = useRef<number>(0);
  const handleCenterTap = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;
    if (isDoubleTap) {
      // Double-tap always likes (never unlikes) - matches TikTok/Instagram
      // convention, so repeated double-taps don't accidentally toggle
      // the like back off.
      if (!(likedMap[story.id] ?? false)) {
        toggleLike(story.id, true);
      } else {
        setBurstKey((k) => k + 1); // still show the burst for feedback
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      {/* This button is a direct child of the `fixed inset-0` backdrop,
          so its offset is measured from the true viewport edge, not from
          the centred story card below. layout.tsx sets viewportFit:
          "cover", so in an installed standalone PWA the viewport starts
          underneath the system status bar / notch and
          env(safe-area-inset-top) is non-zero there - a bare top-4
          (16px) drew this button across the clock/battery icons on
          Android and under the notch/Dynamic Island on iOS. Same fix
          already shipped for shorts/page.tsx's equivalent top chrome; an
          ordinary mobile browser already clears the status bar with its
          address bar, and the inset resolves to 0 there, so calc(1rem +
          0px) stays the original 16px on every surface that was already
          correct.

          This was also a padding-less hit target: an 8x8 (32px) icon
          with no padding around it, under this repo's 44px touch-target
          floor. rounded-full bg-black/40 p-2 matches the close-button
          convention used elsewhere in this codebase (shorts/page.tsx,
          VideoFeedViewer.tsx) and brings the tappable area to 48x48. */}
      <button
        onClick={onClose}
        aria-label={t("help.close")}
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-20 flex items-center justify-center rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 hover:text-gray-300"
      >
        <X className="w-8 h-8" />
      </button>

      {/* Story management: Edit/Delete, own story only. The backend is
          the real gate (PUT/DELETE /api/stories/{id} verify ownership
          against the DB) - hiding this button for anyone else's story is
          a UX nicety, not the enforcement. Positioned to the left of the
          close button, same z-tier and safe-area handling. */}
      {isOwnStory && (
        <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-16 z-20">
          <button
            onClick={() => setShowOptions((v) => !v)}
            aria-label={t("post.moreOptions")}
            aria-haspopup="menu"
            aria-expanded={showOptions}
            className="flex items-center justify-center rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 hover:text-gray-300"
          >
            <MoreVertical className="w-6 h-6" />
          </button>

          {showOptions && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowOptions(false)}
              />
              <div
                role="menu"
                className="absolute end-0 top-full mt-1 z-40 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-zrp-charcoal"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={openEdit}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Pencil className="w-4 h-4" />
                  {t("action.edit")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={requestDelete}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-zrp-red hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Trash2 className="w-4 h-4" />
                  {t("action.delete")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div
        className="relative w-full max-w-md h-[80vh] bg-gray-900 rounded-lg overflow-hidden outline-none"
        role="group"
        tabIndex={0}
        autoFocus
        onKeyDown={(e) => {
          // The prev/pause/next zones below are pointer-only (tap/click
          // hit areas with no visible affordance, matching the
          // Instagram/TikTok-style story UX this mirrors) - without this,
          // a keyboard-only user had no way to move through stories at
          // all. Mirrors what the tap zones already do, just via keys.
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            prev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            next();
          } else if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            setPaused((p) => !p);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
          {stories.map((_, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 bg-gray-600 rounded-full overflow-hidden"
            >
              <div
                className="h-full w-full origin-left bg-white transition-transform"
                style={{
                  transform: `scaleX(${
                    idx === currentIndex ? progress / 100 : idx < currentIndex ? 1 : 0
                  })`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Story content */}
        <div className="relative w-full h-full flex items-center justify-center">
          {story.mediaUrl ? (
            <>
              {story.mediaType === "video" ? (
                <video src={story.mediaUrl} className="max-h-full max-w-full" controls autoPlay />
              ) : (
                <img
                  src={story.mediaUrl}
                  alt="Story"
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {/* Text overlay, bottom aligned */}
              {story.content && (
                <div className="absolute bottom-12 left-0 right-0 text-center text-white p-4 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-sm font-light tracking-wide drop-shadow-md">
                    {story.content}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-white text-center p-6">
              <p className="text-xl font-medium">{story.content || "No content"}</p>
            </div>
          )}

          {/* Heart-burst animation on double-tap-to-like */}
          <div
            key={burstKey}
            className={burstKey > 0 ? "story-heart-burst" : "hidden"}
            aria-hidden="true"
          >
            <Heart className="w-24 h-24 text-white fill-zrp-red text-zrp-red drop-shadow-lg" />
          </div>
        </div>

        {/* Author -> profile.

            Two separate reasons a tap here did nothing. First, this
            block was a plain <div>: the author's id and username were
            right here in `group.user` but nothing was ever wired to
            them, so there was no navigation to perform. Second - and
            why simply adding an onClick would not have been enough -
            the three story navigation zones below are `z-10` and span
            the full height, the same z-index as this block but later in
            the DOM, so the left "previous story" zone won the hit test
            over the author's own name and avatar. It is a real link now,
            it sits above those zones at z-20 like the like button
            already does, and it stops the tap from also reaching them.
            Closing the viewer first means the profile is not left
            underneath a fullscreen overlay. */}
        <Link
          href={`/profile/${group.user.username}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-12 left-4 z-20 flex items-center gap-2 rounded-full py-1 pe-3 text-white transition hover:bg-white/10 focus-visible:bg-white/10"
        >
          <div className="w-8 h-8 rounded-full bg-gray-500 overflow-hidden">
            {group.user.avatarUrl ? (
              <img
                src={group.user.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                {group.user.name?.[0] || group.user.username[0]}
              </div>
            )}
          </div>
          <span className="font-medium text-sm">{group.user.name || group.user.username}</span>
        </Link>

        {/* View count, top right */}
        <div className="absolute top-12 right-4 flex items-center gap-1 text-white/70 text-xs z-10 bg-black/30 px-2 py-1 rounded-full">
          <Eye className="w-3 h-3" />
          <span>{story.viewCount ?? 0}</span>
        </div>

        {/* Reply bar, Instagram-style - a real private DM to the story
            owner (POST /api/messages with storyId), not a public comment.
            Hidden on your own story: there's no one to DM. Sits left of
            the like button (right-20 leaves it clear) at the same
            z-20 tier so it isn't swallowed by the full-height nav zones
            below; focusing it pauses the story exactly like the
            press-and-hold middle zone already does. */}
        {!isOwnStory && (
          <form
            onSubmit={sendReply}
            className="absolute bottom-6 left-4 right-20 z-20 flex items-center gap-2"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              maxLength={MAX_REPLY_LENGTH}
              placeholder={t("stories.replyPlaceholder") || "Reply to story..."}
              aria-label={t("stories.replyPlaceholder") || "Reply to story"}
              disabled={sendingReply}
              className="min-w-0 flex-1 rounded-full border border-white/30 bg-black/30 px-4 py-2 text-sm text-white placeholder-white/60 outline-none backdrop-blur-sm focus:border-white/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sendingReply || !replyText.trim()}
              aria-label="Send reply"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
        {!isOwnStory && (replyError || replySent) && (
          <div
            className={`absolute bottom-[4.25rem] left-4 right-20 z-20 rounded-lg px-3 py-1.5 text-xs text-white ${
              replyError ? "bg-red-600/90" : "bg-black/60"
            }`}
            role="status"
          >
            {replyError || t("stories.replySent")}
          </div>
        )}

        {/* Like button, bottom right, TikTok-style vertical action rail */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(story.id, false);
          }}
          className="absolute bottom-6 right-4 z-20 flex flex-col items-center gap-1 text-white"
          aria-pressed={liked}
          aria-label={liked ? "Unlike story" : "Like story"}
        >
          <Heart
            className={`w-8 h-8 transition-transform active:scale-90 ${
              liked ? "fill-zrp-red text-zrp-red" : "text-white"
            }`}
          />
          <span className="text-xs font-medium drop-shadow-md">{likeCount}</span>
        </button>

        {/* Navigation */}
        <div
          className="absolute left-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={prev}
        />
        <div
          className="absolute left-1/3 top-0 w-1/3 h-full cursor-pointer z-10"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onClick={handleCenterTap}
        />
        <div
          className="absolute right-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={next}
        />

        {/* Edit panel, own story only - text-only, matching the same
            convention Post edit already uses (media is never touched by
            an edit on either client). Covers the card so the navigation
            zones behind it can't be tapped while editing. */}
        {editing && (
          <div
            className="absolute inset-0 z-30 flex flex-col justify-end bg-black/70 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={t("stories.editPlaceholder")}
              aria-label={t("stories.editPlaceholder")}
              autoFocus
              rows={4}
              className="w-full resize-none rounded-xl border border-white/30 bg-black/40 p-3 text-sm text-white placeholder-white/60 outline-none backdrop-blur-sm focus:border-white/60"
            />
            {editError && (
              <div role="alert" className="mt-2 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs text-white">
                {editError}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingEdit}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit}
                className="rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
              >
                {t("action.save")}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title={t("stories.deleteStoryConfirmTitle")}
          body={deleteError || t("stories.deleteStoryConfirmBody")}
          confirmLabel={t("action.delete")}
          cancelLabel={t("action.cancel")}
          destructive
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      <style jsx>{`
        .story-heart-burst {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: heartBurst 0.7s ease-out forwards;
          pointer-events: none;
          z-index: 15;
        }
        @keyframes heartBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.4);
          }
          25% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.15);
          }
          40% {
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
