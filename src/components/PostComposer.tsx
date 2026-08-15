"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Image, FileImage, BarChart3, Plus, Trash2, Clock, Briefcase, FileText, Smile } from "lucide-react";
import GifPicker from "./GifPicker";
import EmojiPicker from "emoji-picker-react";
import { uploadFiles } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";
import { useLanguage } from "@/contexts/LanguageContext";
import MentionAutocomplete from "./MentionAutocomplete";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

type PostType = "POST" | "RECRUITMENT" | "ARTICLE";

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = session?.user?.plan || "free";
  const limits = getPlanLimits(plan);
  const features = session?.user?.features;

  const [postType, setPostType] = useState<PostType>("POST");
  const [schedulePost, setSchedulePost] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollExpiry, setPollExpiry] = useState("");
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Draft protection ────────────────────────────────────────────
  // Composer text should never be lost to an accidental navigation,
  // refresh, or tab close. Auto-saves to localStorage as the person
  // types, restores it the next time the composer mounts, and clears
  // it once a post is actually published. One shared draft slot across
  // both places the composer is mounted (home feed + profile page),
  // matching how a single "in progress" draft is the expected behavior.
  const DRAFT_KEY = "zrp:composer:draft";
  const hasRestoredDraft = useRef(false);

  useEffect(() => {
    if (hasRestoredDraft.current) return;
    hasRestoredDraft.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.content) setContent(draft.content);
        if (draft.imageUrls?.length) setImageUrls(draft.imageUrls);
        if (draft.mediaType) setMediaType(draft.mediaType);
        if (draft.postType) setPostType(draft.postType);
      }
    } catch {
      // Corrupt/unavailable localStorage - just start with an empty composer
    }
  }, []);

  useEffect(() => {
    // Nothing worth saving yet - avoid writing an empty draft over a
    // potentially-still-loading restored one on the very first render.
    if (!hasRestoredDraft.current) return;
    try {
      if (!content.trim() && imageUrls.length === 0) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ content, imageUrls, mediaType, postType })
        );
      }
    } catch {
      // Storage full/unavailable - draft protection is best-effort, not critical
    }
  }, [content, imageUrls, mediaType, postType]);

  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string): string[] => {
    const matches = text.match(/@[\w\u0590-\u05fe]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  // ─── Multi-image upload (up to 4, matching X, or the plan's lower limit) ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      setError("No file selected");
      return;
    }

    const maxImages = Math.min(limits.imagesPerPost || 1, 4);

    // ─── Video: strictly single-file, cannot mix with images ─────────
    const hasVideo = files.some((f) => f.type.startsWith("video/"));
    if (hasVideo) {
      if (files.length > 1 || imageUrls.length > 0) {
        setError(t("composer.errOnlyMedia"));
        return;
      }
    } else if (imageUrls.length + files.length > maxImages) {
      setError(t("composer.errAlreadyUploaded", { n: maxImages }));
      return;
    }

    for (const file of files) {
      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? limits.videoUploadMB * 1024 * 1024 : 4 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(t("composer.errFileTooLarge", { size: isVideo ? limits.videoUploadMB : 4 }));
        return;
      }
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        setError(t("composer.errOnlyMedia"));
        return;
      }
    }

    setUploading(true);
    setError(null);

    try {
      const result = await uploadFiles("postMedia", { files });
      console.log("✅ Upload result:", result);

      if (result && result.length > 0) {
        const isVideoUpload = result[0].type?.startsWith("video");
        if (isVideoUpload) {
          setImageUrls([result[0].ufsUrl]);
          setMediaType("video");
        } else {
          setImageUrls((prev) => [...prev, ...result.map((f) => f.ufsUrl)]);
          setMediaType("image");
        }
      } else {
        throw new Error("No file returned from upload");
      }
    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(t("composer.errUploadFailed") + ": " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleGifSelect = (gifUrl: string) => {
    if (imageUrls.length > 0) {
      setError(t("composer.errGifLimit", { n: limits.imagesPerPost }));
      return;
    }
    setImageUrls([gifUrl]);
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

  const canPostRecruitment = features?.recruitmentProfiles ?? false;
  const canPublishArticle = features?.articlePublishing ?? false;
  const showTypeSelector = canPostRecruitment || canPublishArticle;

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setCursorPosition(e.target.selectionStart || 0);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleMentionSelect = (mention: string) => {
    const before = content.slice(0, cursorPosition);
    const after = content.slice(cursorPosition);
    const match = before.match(/@\w*$/);
    if (match) {
      const start = before.length - match[0].length;
      const newContent = before.slice(0, start) + mention + after;
      setContent(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = start + mention.length;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  // ─── Insert an emoji at the current cursor position (not just appended
  // to the end) and restore the cursor right after the inserted emoji ──
  const handleEmojiSelect = (emojiData: { emoji: string }) => {
    const start = textareaRef.current?.selectionStart ?? cursorPosition;
    const end = textareaRef.current?.selectionEnd ?? cursorPosition;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = before + emojiData.emoji + after;
    setContent(newContent);
    setShowEmojiPicker(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = start + emojiData.emoji.length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        textareaRef.current.focus();
        setCursorPosition(newPos);
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() && !pollQuestion.trim() && postType !== "ARTICLE") {
      setError(t("composer.errWriteSomething"));
      return;
    }

    if (postType === "RECRUITMENT" && !company.trim()) {
      setError(t("composer.errCompanyRequired"));
      return;
    }

    if (postType === "ARTICLE" && !articleBody.trim()) {
      setError(t("composer.errArticleRequired"));
      return;
    }

    if (schedulePost && scheduledAt) {
      const selectedDate = new Date(scheduledAt);
      if (selectedDate <= new Date()) {
        setError(t("composer.errScheduleFuture"));
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
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        mediaType: mediaType || undefined,
        hashtags,
        mentions,
        isPoll: !!pollData,
        status: schedulePost ? "scheduled" : "published",
        scheduledAt: schedulePost ? scheduledAt : null,
        commentsEnabled,
        type: postType,
      };

      if (postType === "RECRUITMENT") {
        payload.company = company.trim();
        payload.location = location.trim();
        payload.applyUrl = applyUrl.trim();
      }

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

      let result;
      try {
        result = await res.json();
      } catch {
        onPostCreated(null);
        resetForm();
        setLoading(false);
        return;
      }

      const post = result.post || result;
      onPostCreated(post);
      resetForm();
    } catch (err) {
      console.error("Error creating post:", err);
      setTimeout(() => window.location.reload(), 2000);
      setError(t("composer.errSomethingWrong"));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // no-op
    }
    setContent("");
    setImageUrls([]);
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

  const isSubmitDisabled = (() => {
    if (loading) return true;
    if (isOverLimit) return true;
    if (imageUrls.length > 0 && !limits.imagesPerPost) return true;

    if (!content.trim() && !pollQuestion.trim() && postType !== "ARTICLE") return true;
    if (showPollBuilder && !isPollValid) return true;
    if (postType === "RECRUITMENT" && !company.trim()) return true;
    if (postType === "ARTICLE" && !articleBody.trim()) return true;

    return false;
  })();

  return (
    <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700" ref={composerRef}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold flex-shrink-0 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="flex-1 space-y-2 relative">
            {showTypeSelector && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t("composer.postAs")}</span>
                <button
                  type="button"
                  onClick={() => setPostType("POST")}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    postType === "POST"
                      ? "bg-zrp-red text-white border-zrp-red"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {t("action.post")}
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
                    <Briefcase className="w-3 h-3" /> {t("composer.recruitment")}
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
                    <FileText className="w-3 h-3" /> {t("composer.article")}
                  </button>
                )}
              </div>
            )}

            {postType !== "ARTICLE" ? (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                placeholder={postType === "RECRUITMENT" ? t("composer.placeholderRecruitment") : t("composer.placeholderDefault")}
                className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[80px] bg-transparent"
                maxLength={limits.postLength}
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleContentChange}
                  placeholder={t("composer.placeholderArticleTitle")}
                  className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[40px] bg-transparent text-lg font-semibold"
                  maxLength={limits.postLength}
                />
                <textarea
                  value={articleBody}
                  onChange={(e) => {
                    setArticleBody(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder={t("composer.placeholderArticleBody")}
                  className="w-full resize-none border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[200px] bg-gray-50 dark:bg-gray-800/50 font-mono text-sm"
                />
                <p className="text-xs text-gray-400">{t("composer.articleMarkdown")}</p>
              </div>
            )}

            <MentionAutocomplete
              text={content}
              cursorPosition={cursorPosition}
              onSelect={handleMentionSelect}
              onClose={() => {}}
            />

            {postType === "RECRUITMENT" && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t("composer.companyPlaceholder")}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                  required
                />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("composer.locationPlaceholder")}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                />
                <input
                  type="url"
                  value={applyUrl}
                  onChange={(e) => setApplyUrl(e.target.value)}
                  placeholder={t("composer.applyUrlPlaceholder")}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zrp-deepBlack text-gray-900 dark:text-white text-sm"
                />
              </div>
            )}

            {error && (
              <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>
            )}

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
                {schedulePost ? t("composer.scheduleOn") : t("composer.schedule")}
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
                <span>{t("composer.allowComments")}</span>
              </label>
            </div>

            {showPollBuilder && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder={t("composer.pollQuestion")}
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
                        placeholder={t("composer.option", { n: idx + 1 })}
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
                    className="text-zrp-red text-sm hover:underline disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 inline mr-1" /> {t("composer.addOption")}
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500 dark:text-gray-400">{t("composer.ends")}</label>
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

            {imageUrls.length > 0 && (
              <div
                className={`relative mt-2 rounded-xl overflow-hidden grid gap-0.5 ${
                  mediaType === "video" || imageUrls.length === 1
                    ? "grid-cols-1"
                    : imageUrls.length === 2
                    ? "grid-cols-2"
                    : imageUrls.length === 3
                    ? "grid-cols-2 grid-rows-2"
                    : "grid-cols-2 grid-rows-2"
                }`}
              >
                {mediaType === "video" ? (
                  <video src={imageUrls[0]} controls className="max-h-80 w-full rounded-xl" />
                ) : (
                  imageUrls.map((url, idx) => (
                    <div
                      key={url}
                      className={`relative bg-gray-100 dark:bg-gray-800 ${
                        imageUrls.length === 3 && idx === 0 ? "row-span-2" : ""
                      }`}
                    >
                      <img
                        src={url}
                        alt={`Upload preview ${idx + 1}`}
                        className={`w-full object-cover ${
                          imageUrls.length === 1 ? "max-h-80" : "h-40 sm:h-48"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                        className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 text-lg leading-none w-6 h-6 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
                {mediaType === "video" && (
                  <button
                    type="button"
                    onClick={() => { setImageUrls([]); setMediaType(null); }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 text-xl leading-none w-7 h-7 flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className={`text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition ${
                  uploading || (imageUrls.length >= Math.min(limits.imagesPerPost || 1, 4)) ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading || imageUrls.length >= Math.min(limits.imagesPerPost || 1, 4)}
                  />
                  <Image className="w-5 h-5" />
                  {uploading && <span className="text-xs ml-1 text-gray-400 dark:text-gray-500">{t("composer.uploading")}</span>}
                </label>

                <button
                  type="button"
                  onClick={() => setShowGifPicker(true)}
                  className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                  title={t("composer.addGif")}
                >
                  <FileImage className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Capture where the cursor actually is right before
                    // opening the picker, since focus will move away from
                    // the textarea onto the picker itself.
                    if (textareaRef.current) {
                      setCursorPosition(textareaRef.current.selectionStart || 0);
                    }
                    setShowEmojiPicker((v) => !v);
                  }}
                  className={`text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition ${
                    showEmojiPicker ? "text-zrp-red dark:text-zrp-red" : ""
                  }`}
                  title="Add emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {postType === "POST" && (
                  <button
                    type="button"
                    onClick={() => setShowPollBuilder(!showPollBuilder)}
                    className={`text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition ${
                      showPollBuilder ? "text-zrp-red dark:text-zrp-red" : ""
                    }`}
                    title={t("composer.addPoll")}
                  >
                    <BarChart3 className="w-5 h-5" />
                  </button>
                )}

                {postType !== "ARTICLE" && (
                  <span className={`text-xs ${isOverLimit ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                    {content.length}/{limits.postLength}
                    {isOverLimit && t("composer.overLimit")}
                  </span>
                )}

                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="bg-zrp-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? t("composer.posting") : schedulePost ? t("composer.scheduleButton") : t("composer.postButton")}
              </button>
            </div>
          </div>
        </div>
      </form>

      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}

      {showEmojiPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
          onClick={() => setShowEmojiPicker(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:w-auto p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="sr-only">Close</span>
                ✕
              </button>
            </div>
            <EmojiPicker onEmojiClick={handleEmojiSelect} width="100%" height={380} />
          </div>
        </div>
      )}
    </div>
  );
}
