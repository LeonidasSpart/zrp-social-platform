"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Image, FileImage, BarChart3, Plus, Trash2, Clock } from "lucide-react";
import GifPicker from "./GifPicker";
import { useUploadThing } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Get user's plan and limits ──────────────────────────────────
  const plan = session?.user?.plan || "free";
  const limits = getPlanLimits(plan);

  // ─── Scheduling ──────────────────────────────────────────────────
  const [schedulePost, setSchedulePost] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // GIF picker
  const [showGifPicker, setShowGifPicker] = useState(false);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollExpiry, setPollExpiry] = useState("");
  const [showPollBuilder, setShowPollBuilder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Uploadthing upload hook ──────────────────────────────────────
  const { startUpload, isUploading } = useUploadThing("postMedia", {
    onClientUploadComplete: (files) => {
      const file = files[0];
      setImageUrl(file.url);
      setMediaType(file.type.startsWith("video") ? "video" : "image");
      setUploading(false);
    },
    onUploadError: (error) => {
      setError("Upload failed: " + error.message);
      setUploading(false);
    },
  });

  // ─── Utility: extract hashtags & mentions ──────────────────────
  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string): string[] => {
    const matches = text.match(/@[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  // ─── Image / Video upload (with plan limit check) ────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ─── Check if user already has an image (plan limit) ──────────
    if (imageUrl) {
      setError(`You've already uploaded an image. Your plan allows ${limits.imagesPerPost} image(s) per post.`);
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? limits.videoUploadMB * 1024 * 1024 : 4 * 1024 * 1024;

    if (file.size > maxSize) {
      setError(`File too large. Max ${isVideo ? limits.videoUploadMB : 4}MB.`);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Only images and videos are allowed.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await startUpload([file]);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Upload failed. Please try again.");
      setUploading(false);
    }
  };

  // ─── GIF picker ──────────────────────────────────────────────────
  const handleGifSelect = (gifUrl: string) => {
    // Check if user already has an image
    if (imageUrl) {
      setError(`Your plan allows ${limits.imagesPerPost} image(s) per post.`);
      return;
    }
    setImageUrl(gifUrl);
    setMediaType("image");
    setShowGifPicker(false);
  };

  // ─── Poll management ────────────────────────────────────────────
  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, ""]);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      const newOptions = pollOptions.filter((_, i) => i !== index);
      setPollOptions(newOptions);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  // ─── Submit post ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !pollQuestion.trim()) {
      setError("Please write something or ask a poll question.");
      return;
    }

    // Validate scheduled date
    if (schedulePost && scheduledAt) {
      const selectedDate = new Date(scheduledAt);
      if (selectedDate <= new Date()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const hashtags = extractHashtags(content);
      const mentions = extractMentions(content);

      let pollData = null;
      if (showPollBuilder && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
        pollData = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()),
          expiresAt: pollExpiry || undefined,
        };
      }

      const payload: any = {
        content: content.trim() || pollQuestion.trim(),
        imageUrl: imageUrl || undefined,
        mediaType: mediaType || undefined, // ✅ add mediaType
        hashtags,
        mentions,
        isPoll: !!pollData,
        status: schedulePost ? "scheduled" : "published",
        scheduledAt: schedulePost ? scheduledAt : null,
      };

      if (pollData) {
        payload.poll = pollData;
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMsg = "Failed to create post";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // If response isn't JSON, reload to recover from a possible server error
          window.location.reload();
          return;
        }
        setError(errorMsg);
        setLoading(false);
        return;
      }

      let post;
      try {
        post = await res.json();
      } catch {
        // If no JSON returned, just refresh the feed
        onPostCreated(null);
        resetForm();
        setLoading(false);
        return;
      }

      // ─── Success: notify parent and reset ──────────────────────────
      onPostCreated(post);
      resetForm();
    } catch (err) {
      console.error("Error creating post:", err);
      setTimeout(() => window.location.reload(), 2000);
      setError("Something went wrong. Check your feed to see if your post was published.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setContent("");
    setImageUrl(null);
    setMediaType(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollExpiry("");
    setShowPollBuilder(false);
    setSchedulePost(false);
    setScheduledAt("");
    setError(null);
  };

  // ─── Render helpers ─────────────────────────────────────────────
  const displayName = session?.user?.name || session?.user?.username || "User";
  const initial = displayName?.[0]?.toUpperCase() || "?";
  const avatarUrl = session?.user?.avatarUrl;

  const isPollValid = showPollBuilder &&
    pollQuestion.trim() &&
    pollOptions.filter(o => o.trim()).length >= 2;

  const remaining = limits.postLength - content.length;
  const isOverLimit = remaining < 0;

  return (
    <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          {/* ─── Avatar ─── */}
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold flex-shrink-0 overflow-hidden">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <div className="flex-1 space-y-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening? Use #hashtags and @mentions"
              className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[80px] bg-transparent"
              maxLength={limits.postLength}
            />

            {/* Error */}
            {error && (
              <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>
            )}

            {/* ─── Scheduling ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setSchedulePost(!schedulePost)}
                className={`text-xs flex items-center gap-1 px-3 py-1 rounded-full border ${
                  schedulePost
                    ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                    : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {schedulePost ? "Scheduling on" : "Schedule"}
              </button>
              {schedulePost && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              )}
            </div>

            {/* ─── Poll Builder ────────────────────────────────────── */}
            {showPollBuilder && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Poll question..."
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                  maxLength={200}
                />
                <div className="mt-2 space-y-1.5">
                  {pollOptions.map((option, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updatePollOption(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                        maxLength={60}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removePollOption(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    onClick={addPollOption}
                    disabled={pollOptions.length >= 6}
                    className="text-blue-600 dark:text-blue-400 text-sm hover:underline disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 inline mr-1" /> Add option
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500 dark:text-gray-400">Ends</label>
                    <input
                      type="datetime-local"
                      value={pollExpiry}
                      onChange={(e) => setPollExpiry(e.target.value)}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Media Preview ──────────────────────────────────── */}
            {imageUrl && (
              <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                {mediaType === "video" ? (
                  <video src={imageUrl} controls className="max-h-60 w-auto rounded-lg" />
                ) : (
                  <img src={imageUrl} alt="Upload preview" className="max-h-60 w-auto rounded-lg" />
                )}
                <button
                  type="button"
                  onClick={() => { setImageUrl(null); setMediaType(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 text-xl leading-none w-7 h-7 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}

            {/* ─── Toolbar ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading || (!!imageUrl && !limits.imagesPerPost)}
                  />
                  <Image className="w-5 h-5" />
                  {uploading && <span className="text-xs ml-1 text-gray-400 dark:text-gray-500">Uploading...</span>}
                </label>

                <button
                  type="button"
                  onClick={() => setShowGifPicker(true)}
                  className="text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                  title="Add GIF"
                >
                  <FileImage className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowPollBuilder(!showPollBuilder)}
                  className={`text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition ${
                    showPollBuilder ? "text-blue-500 dark:text-blue-400" : ""
                  }`}
                  title="Add Poll"
                >
                  <BarChart3 className="w-5 h-5" />
                </button>

                <span className={`text-xs ${isOverLimit ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                  {content.length}/{limits.postLength}
                  {isOverLimit && " (over limit!)"}
                </span>

                {/* ─── Plan indicator (optional) ───────────────────── */}
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </span>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  (!content.trim() && !pollQuestion.trim()) ||
                  (showPollBuilder && !isPollValid) ||
                  isOverLimit ||
                  (!!imageUrl && !limits.imagesPerPost)
                }
                className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Posting..." : schedulePost ? "Schedule" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* GIF Picker Modal */}
      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}
    </div>
  );
}
