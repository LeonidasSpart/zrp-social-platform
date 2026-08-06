"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Image, FileImage, BarChart3, Plus, Trash2, Clock, Briefcase, FileText, X } from "lucide-react";
import GifPicker from "./GifPicker";
import { useUploadThing } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

type PostType = "POST" | "RECRUITMENT" | "ARTICLE";

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = session?.user?.plan || "free";
  const limits = getPlanLimits(plan);
  const features = session?.user?.features;

  // ─── Post type ────────────────────────────────────────────────────
  const [postType, setPostType] = useState<PostType>("POST");

  // ─── Schedule ────────────────────────────────────────────────────
  const [schedulePost, setSchedulePost] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);

  // ─── GIF picker ──────────────────────────────────────────────────
  const [showGifPicker, setShowGifPicker] = useState(false);

  // ─── Poll ────────────────────────────────────────────────────────
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollExpiry, setPollExpiry] = useState("");
  const [showPollBuilder, setShowPollBuilder] = useState(false);

  // ─── Recruitment fields ──────────────────────────────────────────
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");

  // ─── Article fields ──────────────────────────────────────────────
  const [articleBody, setArticleBody] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string): string[] => {
    const matches = text.match(/@[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleGifSelect = (gifUrl: string) => {
    if (imageUrl) {
      setError(`Your plan allows ${limits.imagesPerPost} image(s) per post.`);
      return;
    }
    setImageUrl(gifUrl);
    setMediaType("image");
    setShowGifPicker(false);
  };

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

  // ─── Check if user can use certain post types ──────────────────
  const canPostRecruitment = features?.recruitmentProfiles ?? false;
  const canPublishArticle = features?.articlePublishing ?? false;

  // ─── Determine if we should show type selector ──────────────────
  const showTypeSelector = canPostRecruitment || canPublishArticle;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!content.trim() && !pollQuestion.trim() && postType !== "ARTICLE") {
      setError("Please write something or ask a poll question.");
      return;
    }

    if (postType === "RECRUITMENT" && !company.trim()) {
      setError("Please enter a company name for recruitment posts.");
      return;
    }

    if (postType === "ARTICLE" && !articleBody.trim()) {
      setError("Please write the article content.");
      return;
    }

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
        content: content.trim() || (postType === "ARTICLE" ? "" : pollQuestion.trim()),
        imageUrl: imageUrl || undefined,
        mediaType: mediaType || undefined,
        hashtags,
        mentions,
        isPoll: !!pollData,
        status: schedulePost ? "scheduled" : "published",
        scheduledAt: schedulePost ? scheduledAt : null,
        commentsEnabled,
        type: postType,
      };

      // ─── Recruitment fields ──────────────────────────────────────
      if (postType === "RECRUITMENT") {
        payload.company = company.trim();
        payload.location = location.trim();
        payload.applyUrl = applyUrl.trim();
      }

      // ─── Article fields ──────────────────────────────────────────
      if (postType === "ARTICLE") {
        payload.articleBody = articleBody;
      }

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
        onPostCreated(null);
        resetForm();
        setLoading(false);
        return;
      }

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
    setCommentsEnabled(true);
    setPostType("POST");
    setCompany("");
    setLocation("");
    setApplyUrl("");
    setArticleBody("");
  };

  const displayName = session?.user?.name || session?.user?.username || "User";
  const initial = displayName?.[0]?.toUpperCase() || "?";
  const avatarUrl = session?.user?.avatarUrl;

  const isPollValid = showPollBuilder &&
    pollQuestion.trim() &&
    pollOptions.filter(o => o.trim()).length >= 2;

  const remaining = limits.postLength - content.length;
  const isOverLimit = remaining < 0;

  // ─── Determine if submit should be disabled ─────────────────────
  const isSubmitDisabled = (() => {
    if (loading) return true;
    if (isOverLimit) return true;
    if (!!imageUrl && !limits.imagesPerPost) return true;

    // Basic content check
    if (!content.trim() && !pollQuestion.trim() && postType !== "ARTICLE") return true;

    // Poll validation
    if (showPollBuilder && !isPollValid) return true;

    // Recruitment validation
    if (postType === "RECRUITMENT" && !company.trim()) return true;

    // Article validation
    if (postType === "ARTICLE" && !articleBody.trim()) return true;

    return false;
  })();

  return (
    <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          {/* Avatar */}
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
            {/* ─── Post Type Selector ────────────────────────────────── */}
            {showTypeSelector && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Post as:</span>
                <button
                  type="button"
                  onClick={() => setPostType("POST")}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    postType === "POST"
                      ? "bg-zrp-red text-white border-zrp-red"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  Post
                </button>
                {canPostRecruitment && (
                  <button
                    type="button"
                    onClick={() => setPostType("RECRUITMENT")}
                    className={`text-xs px-3 py-1 rounded-full border transition flex items-center gap-1 ${
                      postType === "RECRUITMENT"
                        ? "bg-zrp-red text-white border-zrp-red"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <Briefcase className="w-3 h-3" /> Recruitment
                  </button>
                )}
                {canPublishArticle && (
                  <button
                    type="button"
                    onClick={() => setPostType("ARTICLE")}
                    className={`text-xs px-3 py-1 rounded-full border transition flex items-center gap-1 ${
                      postType === "ARTICLE"
                        ? "bg-zrp-red text-white border-zrp-red"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <FileText className="w-3 h-3" /> Article
                  </button>
                )}
              </div>
            )}

            {/* ─── Content Input ────────────────────────────────────── */}
            {postType !== "ARTICLE" ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  postType === "RECRUITMENT"
                    ? "Describe the job opportunity... Use #hashtags and @mentions"
                    : "What's happening? Use #hashtags and @mentions"
                }
                className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[80px] bg-transparent"
                maxLength={limits.postLength}
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Article title / teaser (optional)"
                  className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[40px] bg-transparent text-lg font-semibold"
                  maxLength={limits.postLength}
                />
                <textarea
                  value={articleBody}
                  onChange={(e) => setArticleBody(e.target.value)}
                  placeholder="Write your article content in Markdown or HTML..."
                  className="w-full resize-none border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[200px] bg-gray-50 dark:bg-gray-800/50 font-mono text-sm"
                />
                <p className="text-xs text-gray-400">Supports Markdown and HTML</p>
              </div>
            )}

            {/* ─── Recruitment extra fields ─────────────────────────── */}
            {postType === "RECRUITMENT" && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company name *"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                  required
                />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (e.g., Remote, New York, London)"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                />
                <input
                  type="url"
                  value={applyUrl}
                  onChange={(e) => setApplyUrl(e.target.value)}
                  placeholder="Application URL (optional)"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                />
              </div>
            )}

            {error && (
              <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>
            )}

            {/* Scheduling & Comments toggle */}
            <div className="flex flex-wrap items-center gap-3 mt-2">
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

              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={commentsEnabled}
                  onChange={(e) => setCommentsEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-zrp-red focus:ring-zrp-red"
                />
                <span>Allow comments</span>
              </label>
            </div>

            {/* Poll Builder */}
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

            {/* Media Preview */}
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

            {/* Toolbar */}
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

                {postType === "POST" && (
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
                )}

                {postType !== "ARTICLE" && (
                  <>
                    <span className={`text-xs ${isOverLimit ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                      {content.length}/{limits.postLength}
                      {isOverLimit && " (over limit!)"}
                    </span>
                  </>
                )}

                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="bg-zrp-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Posting..." : schedulePost ? "Schedule" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}
    </div>
  );
}
