"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Image,
  FileImage,
  BarChart3,
  Plus,
  Trash2,
  Clock,
  Briefcase,
  FileText,
  Smile,
  X,
  Loader2,
  Video,
} from "lucide-react";
import GifPicker from "./GifPicker";
import dynamic from "next/dynamic";

// PostComposer sits directly on the home page.
// Keep emoji-picker-react out of the initial bundle.
const EmojiPicker = dynamic(
  () => import("emoji-picker-react"),
  { ssr: false }
);

import { uploadFiles } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";
import { useLanguage } from "@/contexts/LanguageContext";
import MentionAutocomplete from "./MentionAutocomplete";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

type PostType = "POST" | "RECRUITMENT" | "ARTICLE";

type FeatureMap = Record<
  string,
  boolean | number | string | null | undefined
>;

export default function PostComposer({
  onPostCreated,
}: PostComposerProps) {
  const { data: session } = useSession();
  const { t } = useLanguage();

  // ─────────────────────────────────────────────────────────────
  // CORE STATE
  // ─────────────────────────────────────────────────────────────

  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<
    "image" | "video" | null
  >(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // ACCOUNT / PLAN
  // ─────────────────────────────────────────────────────────────

  const plan = session?.user?.plan || "free";

  const limits = getPlanLimits(plan);

  const features = session?.user?.features as
    | FeatureMap
    | undefined;

  /*
   * Important:
   *
   * getPlanLimits() remains the source for numeric limits.
   * Feature flags are only used when the account actually provides
   * an explicit flag.
   *
   * This means we do NOT accidentally disable an existing feature
   * for older sessions where a newer feature flag does not exist.
   */

  // TypeScript requires the intermediate unknown cast because
  // PlanLimits does not have a string index signature.
  const rawLimits =
    limits as unknown as Record<
      string,
      unknown
    >;

  const getNumericLimit = (
    key: string,
    fallback: number
  ) => {
    const value = Number(
      rawLimits[key]
    );

    return Number.isFinite(value)
      ? value
      : fallback;
  };

  const getOptionalFeature = (
    keys: string[]
  ): boolean | null => {
    if (!features) return null;

    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(
          features,
          key
        )
      ) {
        const value = features[key];

        if (typeof value === "boolean") {
          return value;
        }

        if (typeof value === "string") {
          return value === "true";
        }

        if (typeof value === "number") {
          return value > 0;
        }
      }
    }

    return null;
  };

  const featureAllowed = (
    keys: string[]
  ) => {
    const explicit =
      getOptionalFeature(keys);

    /*
     * If the current account/session does not expose the feature
     * flag, preserve the existing behavior.
     *
     * The server must still enforce the real permission.
     */
    return explicit === null
      ? true
      : explicit;
  };

  // ─────────────────────────────────────────────────────────────
  // NUMERIC PLAN LIMITS
  // ─────────────────────────────────────────────────────────────

  /*
   * IMPORTANT:
   *
   * Do not use:
   *   limits.imagesPerPost || 1
   *
   * because 0 is a legitimate limit.
   */

  const configuredImagesPerPost = Number(
    limits.imagesPerPost
  );

  const maxImages = Number.isFinite(
    configuredImagesPerPost
  )
    ? Math.max(
        0,
        Math.min(
          configuredImagesPerPost,
          4
        )
      )
    : 0;

  const videoUploadMB = Math.max(
    0,
    Number.isFinite(
      Number(limits.videoUploadMB)
    )
      ? Number(limits.videoUploadMB)
      : 0
  );

  const postLength = Math.max(
    0,
    Number.isFinite(
      Number(limits.postLength)
    )
      ? Number(limits.postLength)
      : 0
  );

  const pollMaxOptions = Math.max(
    2,
    Math.min(
      6,
      getNumericLimit(
        "pollOptionsMax",
        6
      )
    )
  );

  const pollQuestionMaxLength =
    Math.max(
      1,
      getNumericLimit(
        "pollQuestionLength",
        200
      )
    );

  const pollOptionMaxLength =
    Math.max(
      1,
      getNumericLimit(
        "pollOptionLength",
        60
      )
    );

  // ─────────────────────────────────────────────────────────────
  // FEATURE PERMISSIONS
  // ─────────────────────────────────────────────────────────────

  const canPostRecruitment =
    featureAllowed([
      "recruitmentProfiles",
      "recruitment",
      "recruitmentPosting",
    ]) &&
    Boolean(
      features?.recruitmentProfiles
    );

  const canPublishArticle =
    featureAllowed([
      "articlePublishing",
      "articles",
      "articlePublishingEnabled",
    ]) &&
    Boolean(
      features?.articlePublishing
    );

  const canSchedule =
    featureAllowed([
      "scheduling",
      "schedulePosts",
      "postScheduling",
    ]);

  const canCreatePoll =
    featureAllowed([
      "polls",
      "pollCreation",
      "pollsEnabled",
    ]);

  const canUseGif =
    featureAllowed([
      "gifs",
      "gif",
      "gifPosting",
    ]);

  const showTypeSelector =
    canPostRecruitment ||
    canPublishArticle;

  // ─────────────────────────────────────────────────────────────
  // COMPOSER STATE
  // ─────────────────────────────────────────────────────────────

  const [postType, setPostType] =
    useState<PostType>("POST");

  const [schedulePost, setSchedulePost] =
    useState(false);

  const [scheduledAt, setScheduledAt] =
    useState("");

  const [commentsEnabled, setCommentsEnabled] =
    useState(true);

  const [showGifPicker, setShowGifPicker] =
    useState(false);

  const [showEmojiPicker, setShowEmojiPicker] =
    useState(false);

  const [pollQuestion, setPollQuestion] =
    useState("");

  const [pollOptions, setPollOptions] =
    useState<string[]>(["", ""]);

  const [pollExpiry, setPollExpiry] =
    useState("");

  const [showPollBuilder, setShowPollBuilder] =
    useState(false);

  const [company, setCompany] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [applyUrl, setApplyUrl] =
    useState("");

  const [articleBody, setArticleBody] =
    useState("");

  const [cursorPosition, setCursorPosition] =
    useState(0);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const composerRef =
    useRef<HTMLDivElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  // ─────────────────────────────────────────────────────────────
  // DRAFT PROTECTION
  // ─────────────────────────────────────────────────────────────

  const DRAFT_KEY =
    "zrp:composer:draft";

  const hasRestoredDraft =
    useRef(false);

  useEffect(() => {
    if (hasRestoredDraft.current) {
      return;
    }

    hasRestoredDraft.current = true;

    try {
      const saved =
        localStorage.getItem(
          DRAFT_KEY
        );

      if (!saved) return;

      const draft = JSON.parse(saved);

      if (
        typeof draft.content ===
        "string"
      ) {
        setContent(
          draft.content.slice(
            0,
            postLength
          )
        );
      }

      if (
        Array.isArray(
          draft.imageUrls
        )
      ) {
        const restoredImages =
          draft.imageUrls.slice(
            0,
            maxImages
          );

        if (restoredImages.length) {
          setImageUrls(
            restoredImages
          );
        }
      }

      if (
        draft.mediaType ===
          "image" ||
        draft.mediaType ===
          "video"
      ) {
        setMediaType(
          draft.mediaType
        );
      }

      if (
        draft.postType ===
          "POST" ||
        (draft.postType ===
          "RECRUITMENT" &&
          canPostRecruitment) ||
        (draft.postType ===
          "ARTICLE" &&
          canPublishArticle)
      ) {
        setPostType(
          draft.postType
        );
      }
    } catch {
      // Best effort only.
    }
  }, [
    postLength,
    maxImages,
    canPostRecruitment,
    canPublishArticle,
  ]);

  useEffect(() => {
    if (!hasRestoredDraft.current) {
      return;
    }

    try {
      if (
        !content.trim() &&
        imageUrls.length === 0
      ) {
        localStorage.removeItem(
          DRAFT_KEY
        );
      } else {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            content,
            imageUrls:
              imageUrls.slice(
                0,
                maxImages
              ),
            mediaType,
            postType,
          })
        );
      }
    } catch {
      // Best effort only.
    }
  }, [
    content,
    imageUrls,
    mediaType,
    postType,
    maxImages,
  ]);

  // ─────────────────────────────────────────────────────────────
  // HASHTAGS / MENTIONS
  // ─────────────────────────────────────────────────────────────

  const extractHashtags = (
    text: string
  ): string[] => {
    const matches =
      text.match(
        /#[\w\u0590-\u05fe]+/g
      ) || [];

    return matches.map((tag) =>
      tag.slice(1).toLowerCase()
    );
  };

  const extractMentions = (
    text: string
  ): string[] => {
    const matches =
      text.match(
        /@[\w\u0590-\u05fe]+/g
      ) || [];

    return matches.map((tag) =>
      tag.slice(1).toLowerCase()
    );
  };

  // ─────────────────────────────────────────────────────────────
  // FILE UPLOAD
  // ─────────────────────────────────────────────────────────────

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(
      e.target.files || []
    );

    if (
      files.length === 0
    ) {
      return;
    }

    setError(null);

    if (maxImages <= 0) {
      setError(
        t(
          "composer.errAlreadyUploaded",
          { n: maxImages }
        )
      );

      if (fileInputRef.current) {
        fileInputRef.current.value =
          "";
      }

      return;
    }

    // ─────────────────────────────────────────────────────────
    // VIDEO
    // ─────────────────────────────────────────────────────────

    const hasVideo = files.some(
      (file) =>
        file.type.startsWith(
          "video/"
        )
    );

    if (hasVideo) {
      /*
       * Video is always one media item.
       * It cannot be mixed with images.
       */
      if (
        files.length > 1 ||
        imageUrls.length > 0
      ) {
        setError(
          t(
            "composer.errOnlyMedia"
          )
        );

        if (fileInputRef.current) {
          fileInputRef.current.value =
            "";
        }

        return;
      }

      if (videoUploadMB <= 0) {
        setError(
          t(
            "composer.errFileTooLarge",
            { size: 0 }
          )
        );

        if (fileInputRef.current) {
          fileInputRef.current.value =
            "";
        }

        return;
      }
    } else {
      // ───────────────────────────────────────────────────────
      // IMAGES
      // ───────────────────────────────────────────────────────

      if (
        imageUrls.length +
          files.length >
        maxImages
      ) {
        setError(
          t(
            "composer.errAlreadyUploaded",
            { n: maxImages }
          )
        );

        if (fileInputRef.current) {
          fileInputRef.current.value =
            "";
        }

        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // FILE VALIDATION
    // ─────────────────────────────────────────────────────────

    for (const file of files) {
      const isVideo =
        file.type.startsWith(
          "video/"
        );

      const maxSize = isVideo
        ? videoUploadMB *
          1024 *
          1024
        : 4 *
          1024 *
          1024;

      if (
        file.size > maxSize
      ) {
        setError(
          t(
            "composer.errFileTooLarge",
            {
              size: isVideo
                ? videoUploadMB
                : 4,
            }
          )
        );

        if (fileInputRef.current) {
          fileInputRef.current.value =
            "";
        }

        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        ) &&
        !file.type.startsWith(
          "video/"
        )
      ) {
        setError(
          t(
            "composer.errOnlyMedia"
          )
        );

        if (fileInputRef.current) {
          fileInputRef.current.value =
            "";
        }

        return;
      }
    }

    setUploading(true);

    try {
      const result =
        await uploadFiles(
          "postMedia",
          { files }
        );

      if (
        !result ||
        result.length === 0
      ) {
        throw new Error(
          "No file returned from upload"
        );
      }

      const isVideoUpload =
        result[0].type?.startsWith(
          "video"
        );

      if (isVideoUpload) {
        setImageUrls([
          result[0].ufsUrl,
        ]);

        setMediaType(
          "video"
        );
      } else {
        const newUrls =
          result
            .map(
              (file) =>
                file.ufsUrl
            )
            .filter(Boolean)
            .slice(
              0,
              Math.max(
                0,
                maxImages -
                  imageUrls.length
              )
            );

        if (
          newUrls.length === 0
        ) {
          throw new Error(
            "Your plan does not allow additional images."
          );
        }

        setImageUrls(
          (prev) =>
            [
              ...prev,
              ...newUrls,
            ].slice(
              0,
              maxImages
            )
        );

        setMediaType(
          "image"
        );
      }
    } catch (err) {
      console.error(
        "Upload error:",
        err
      );

      setError(
        t(
          "composer.errUploadFailed"
        ) +
          ": " +
          (err instanceof Error
            ? err.message
            : "Unknown error")
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value =
          "";
      }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // GIF
  // ─────────────────────────────────────────────────────────────

  const handleGifSelect = (
    gifUrl: string
  ) => {
    if (!canUseGif) {
      setError(
        t(
          "composer.errGifLimit",
          { n: maxImages }
        )
      );

      return;
    }

    if (maxImages <= 0) {
      setError(
        t(
          "composer.errGifLimit",
          { n: maxImages }
        )
      );

      return;
    }

    if (
      imageUrls.length > 0
    ) {
      setError(
        t(
          "composer.errGifLimit",
          { n: maxImages }
        )
      );

      return;
    }

    setImageUrls([
      gifUrl,
    ]);

    setMediaType(
      "image"
    );

    setShowGifPicker(
      false
    );

    setError(null);
  };

  // ─────────────────────────────────────────────────────────────
  // POLL
  // ─────────────────────────────────────────────────────────────

  const addPollOption = () => {
    if (
      !canCreatePoll
    ) {
      return;
    }

    if (
      pollOptions.length <
      pollMaxOptions
    ) {
      setPollOptions([
        ...pollOptions,
        "",
      ]);
    }
  };

  const removePollOption = (
    index: number
  ) => {
    if (
      pollOptions.length <=
      2
    ) {
      return;
    }

    setPollOptions(
      pollOptions.filter(
        (_, i) =>
          i !== index
      )
    );
  };

  const updatePollOption = (
    index: number,
    value: string
  ) => {
    const newOptions =
      [...pollOptions];

    newOptions[index] =
      value.slice(
        0,
        pollOptionMaxLength
      );

    setPollOptions(
      newOptions
    );
  };

  const validPollOptions =
    pollOptions.filter(
      (option) =>
        option.trim()
          .length > 0
    );

  const isPollValid =
    canCreatePoll &&
    showPollBuilder &&
    pollQuestion.trim()
      .length > 0 &&
    validPollOptions.length >=
      2;

  // ─────────────────────────────────────────────────────────────
  // CONTENT
  // ─────────────────────────────────────────────────────────────

  const handleContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newContent =
      e.target.value.slice(
        0,
        postLength
      );

    setContent(
      newContent
    );

    setCursorPosition(
      e.target.selectionStart ||
        0
    );

    e.target.style.height =
      "auto";

    e.target.style.height = `${Math.min(
      e.target.scrollHeight,
      280
    )}px`;
  };

  // ─────────────────────────────────────────────────────────────
  // MENTION AUTOCOMPLETE
  // ─────────────────────────────────────────────────────────────

  const handleMentionSelect = (
    mention: string
  ) => {
    const before =
      content.slice(
        0,
        cursorPosition
      );

    const after =
      content.slice(
        cursorPosition
      );

    const match =
      before.match(
        /@\w*$/
      );

    if (!match) {
      return;
    }

    const start =
      before.length -
      match[0].length;

    const newContent =
      before.slice(
        0,
        start
      ) +
      mention +
      after;

    setContent(
      newContent.slice(
        0,
        postLength
      )
    );

    setTimeout(() => {
      if (
        textareaRef.current
      ) {
        const newPos =
          Math.min(
            start +
              mention.length,
            postLength
          );

        textareaRef.current.selectionStart =
          newPos;

        textareaRef.current.selectionEnd =
          newPos;

        textareaRef.current.focus();

        setCursorPosition(
          newPos
        );
      }
    }, 0);
  };

  // ─────────────────────────────────────────────────────────────
  // EMOJI
  // ─────────────────────────────────────────────────────────────

  const handleEmojiSelect = (
    emojiData: {
      emoji: string;
    }
  ) => {
    const start =
      textareaRef.current
        ?.selectionStart ??
      cursorPosition;

    const end =
      textareaRef.current
        ?.selectionEnd ??
      cursorPosition;

    const before =
      content.slice(
        0,
        start
      );

    const after =
      content.slice(
        end
      );

    const available =
      Math.max(
        0,
        postLength -
          before.length -
          after.length
      );

    if (
      available <
      emojiData.emoji.length
    ) {
      setError(
        t(
          "composer.overLimit"
        )
      );

      return;
    }

    const newContent =
      before +
      emojiData.emoji +
      after;

    setContent(
      newContent
    );

    setShowEmojiPicker(
      false
    );

    setTimeout(() => {
      if (
        textareaRef.current
      ) {
        const newPos =
          start +
          emojiData.emoji
            .length;

        textareaRef.current.selectionStart =
          newPos;

        textareaRef.current.selectionEnd =
          newPos;

        textareaRef.current.style.height =
          "auto";

        textareaRef.current.style.height = `${Math.min(
          textareaRef.current
            .scrollHeight,
          280
        )}px`;

        textareaRef.current.focus();

        setCursorPosition(
          newPos
        );
      }
    }, 0);
  };

  // ─────────────────────────────────────────────────────────────
  // POST TYPE
  // ─────────────────────────────────────────────────────────────

  const handlePostTypeChange = (
    type: PostType
  ) => {
    if (
      type ===
      "RECRUITMENT"
    ) {
      if (
        !canPostRecruitment
      ) {
        return;
      }
    }

    if (
      type === "ARTICLE"
    ) {
      if (
        !canPublishArticle
      ) {
        return;
      }
    }

    setPostType(type);

    if (
      type !== "POST"
    ) {
      setShowPollBuilder(
        false
      );
    }
  };

  // ─────────────────────────────────────────────────────────────
  // SCHEDULE
  // ─────────────────────────────────────────────────────────────

  const handleScheduleToggle =
    () => {
      if (!canSchedule) {
        return;
      }

      const next =
        !schedulePost;

      setSchedulePost(
        next
      );

      if (!next) {
        setScheduledAt("");
      }
    };

  // ─────────────────────────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────────────────────────

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (loading || uploading) {
      return;
    }

    setError(null);

    // ─────────────────────────────────────────────────────────
    // FINAL CLIENT-SIDE LIMIT CHECK
    // ─────────────────────────────────────────────────────────

    if (
      content.length >
      postLength
    ) {
      setError(
        t(
          "composer.overLimit"
        )
      );

      return;
    }

    if (
      imageUrls.length >
      maxImages
    ) {
      setError(
        t(
          "composer.errAlreadyUploaded",
          { n: maxImages }
        )
      );

      return;
    }

    if (
      mediaType ===
        "video" &&
      imageUrls.length >
        1
    ) {
      setError(
        t(
          "composer.errOnlyMedia"
        )
      );

      return;
    }

    // ─────────────────────────────────────────────────────────
    // CONTENT
    // ─────────────────────────────────────────────────────────

    if (
      !content.trim() &&
      !pollQuestion.trim() &&
      postType !==
        "ARTICLE"
    ) {
      setError(
        t(
          "composer.errWriteSomething"
        )
      );

      return;
    }

    // ─────────────────────────────────────────────────────────
    // RECRUITMENT
    // ─────────────────────────────────────────────────────────

    if (
      postType ===
      "RECRUITMENT"
    ) {
      if (!canPostRecruitment) {
        return;
      }

      if (!company.trim()) {
        setError(
          t(
            "composer.errCompanyRequired"
          )
        );

        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // ARTICLE
    // ─────────────────────────────────────────────────────────

    if (
      postType ===
      "ARTICLE"
    ) {
      if (!canPublishArticle) {
        return;
      }

      if (!articleBody.trim()) {
        setError(
          t(
            "composer.errArticleRequired"
          )
        );

        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // POLL
    // ─────────────────────────────────────────────────────────

    if (
      showPollBuilder
    ) {
      if (
        !canCreatePoll
      ) {
        setError(
          t(
            "composer.errWriteSomething"
          )
        );

        return;
      }

      if (
        !isPollValid
      ) {
        setError(
          t(
            "composer.errWriteSomething"
          )
        );

        return;
      }

      if (
        validPollOptions.length >
        pollMaxOptions
      ) {
        setError(
          t(
            "composer.errWriteSomething"
          )
        );

        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // SCHEDULING
    // ─────────────────────────────────────────────────────────

    if (
      schedulePost
    ) {
      if (!canSchedule) {
        setSchedulePost(
          false
        );

        return;
      }

      if (!scheduledAt) {
        setError(
          t(
            "composer.errScheduleFuture"
          )
        );

        return;
      }

      const selectedDate =
        new Date(
          scheduledAt
        );

      if (
        Number.isNaN(
          selectedDate.getTime()
        ) ||
        selectedDate <=
          new Date()
      ) {
        setError(
          t(
            "composer.errScheduleFuture"
          )
        );

        return;
      }
    }

    // ─────────────────────────────────────────────────────────
    // POLL EXPIRY
    // ─────────────────────────────────────────────────────────

    if (
      pollExpiry
    ) {
      const expiry =
        new Date(
          pollExpiry
        );

      if (
        Number.isNaN(
          expiry.getTime()
        ) ||
        expiry <=
          new Date()
      ) {
        setError(
          t(
            "composer.errScheduleFuture"
          )
        );

        return;
      }
    }

    setLoading(true);

    try {
      const hashtags =
        extractHashtags(
          content
        );

      const mentions =
        extractMentions(
          content
        );

      let pollData:
        | {
            question: string;
            options: string[];
            expiresAt?: string;
          }
        | null = null;

      if (
        showPollBuilder &&
        isPollValid
      ) {
        pollData = {
          question:
            pollQuestion
              .trim()
              .slice(
                0,
                pollQuestionMaxLength
              ),

          options:
            validPollOptions
              .slice(
                0,
                pollMaxOptions
              )
              .map(
                (option) =>
                  option
                    .trim()
                    .slice(
                      0,
                      pollOptionMaxLength
                    )
              ),

          expiresAt:
            pollExpiry ||
            undefined,
        };
      }

      // ─────────────────────────────────────────────────────────
      // PAYLOAD
      // ─────────────────────────────────────────────────────────

      const payload: any = {
        content:
          content.trim() ||
          (postType ===
          "ARTICLE"
            ? ""
            : pollQuestion.trim()),

        imageUrls:
          imageUrls.length >
          0
            ? imageUrls.slice(
                0,
                maxImages
              )
            : undefined,

        mediaType:
          mediaType ||
          undefined,

        hashtags,

        mentions,

        isPoll:
          Boolean(
            pollData
          ),

        status:
          schedulePost
            ? "scheduled"
            : "published",

        scheduledAt:
          schedulePost
            ? scheduledAt
            : null,

        commentsEnabled,

        type: postType,
      };

      if (
        postType ===
        "RECRUITMENT"
      ) {
        payload.company =
          company.trim();

        payload.location =
          location.trim();

        payload.applyUrl =
          applyUrl.trim();
      }

      if (
        postType ===
        "ARTICLE"
      ) {
        payload.articleBody =
          articleBody;
      }

      if (pollData) {
        payload.poll =
          pollData;
      }

      // ─────────────────────────────────────────────────────────
      // SERVER IS FINAL AUTHORITY
      // ─────────────────────────────────────────────────────────

      const res =
        await fetch(
          "/api/posts",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              payload
            ),
          }
        );

      if (!res.ok) {
        let errorMsg =
          "Failed to create post";

        try {
          const data =
            await res.json();

          errorMsg =
            data.error ||
            errorMsg;
        } catch {
          // Keep original error.
        }

        setError(
          errorMsg
        );

        return;
      }

      let result;

      try {
        result =
          await res.json();
      } catch {
        onPostCreated(
          null
        );

        resetForm();

        return;
      }

      const post =
        result.post ||
        result;

      onPostCreated(
        post
      );

      resetForm();
    } catch (err) {
      console.error(
        "Error creating post:",
        err
      );

      setError(
        t(
          "composer.errSomethingWrong"
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RESET
  // ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    try {
      localStorage.removeItem(
        DRAFT_KEY
      );
    } catch {
      // no-op
    }

    setContent("");
    setImageUrls([]);
    setMediaType(null);

    setPollQuestion("");
    setPollOptions([
      "",
      "",
    ]);
    setPollExpiry("");
    setShowPollBuilder(
      false
    );

    setSchedulePost(
      false
    );

    setScheduledAt("");

    setError(null);

    setCommentsEnabled(
      true
    );

    setPostType("POST");

    setCompany("");
    setLocation("");
    setApplyUrl("");
    setArticleBody("");

    setShowEmojiPicker(
      false
    );

    setShowGifPicker(
      false
    );

    setCursorPosition(
      0
    );
  };

  // ─────────────────────────────────────────────────────────────
  // DISPLAY DATA
  // ─────────────────────────────────────────────────────────────

  const displayName =
    session?.user?.name ||
    session?.user?.username ||
    "User";

  const initial =
    displayName
      ?.charAt(0)
      .toUpperCase() ||
    "?";

  const avatarUrl =
    session?.user?.avatarUrl;

  const remaining =
    postLength -
    content.length;

  const isOverLimit =
    remaining < 0;

  const hasContent =
    Boolean(
      content.trim()
    );

  const hasMedia =
    imageUrls.length > 0;

  const hasPoll =
    showPollBuilder;

  const canAddMoreImages =
    maxImages > 0 &&
    imageUrls.length <
      maxImages;

  const isSubmitDisabled =
    loading ||
    uploading ||
    isOverLimit ||
    imageUrls.length >
      maxImages ||
    (postType ===
      "RECRUITMENT" &&
      !company.trim()) ||
    (postType ===
      "ARTICLE" &&
      !articleBody.trim()) ||
    (hasPoll &&
      !isPollValid) ||
    (schedulePost &&
      !scheduledAt) ||
    (!hasContent &&
      !hasMedia &&
      !hasPoll &&
      postType !==
        "ARTICLE");

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={composerRef}
      className="
        zrp-post-composer
        bg-white
        dark:bg-zrp-deepBlack
        rounded-2xl
        shadow-sm
        border
        border-gray-200
        dark:border-gray-700
        overflow-hidden
      "
    >
      <form
        onSubmit={
          handleSubmit
        }
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">

            {/* ─────────────────────────────────────────────── */}
            {/* AVATAR */}
            {/* ─────────────────────────────────────────────── */}

            <div
              className="
                w-10
                h-10
                sm:w-11
                sm:h-11
                rounded-full
                bg-zrp-red/10
                flex
                items-center
                justify-center
                text-zrp-red
                font-semibold
                flex-shrink-0
                overflow-hidden
                ring-1
                ring-gray-200
                dark:ring-gray-700
              "
            >
              {avatarUrl ? (
                <img
                  src={
                    avatarUrl
                  }
                  alt={
                    displayName
                  }
                  className="
                    w-full
                    h-full
                    object-cover
                  "
                />
              ) : (
                initial
              )}
            </div>

            <div className="flex-1 min-w-0">

              {/* ───────────────────────────────────────────── */}
              {/* POST TYPE SELECTOR */}
              {/* ───────────────────────────────────────────── */}

              {showTypeSelector && (
                <div
                  className="
                    flex
                    items-center
                    gap-2
                    mb-3
                    overflow-x-auto
                    scrollbar-hide
                    pb-0.5
                  "
                >
                  <span
                    className="
                      text-sm
                      text-gray-500
                      dark:text-gray-400
                      font-medium
                      whitespace-nowrap
                    "
                  >
                    {t(
                      "composer.postAs"
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handlePostTypeChange(
                        "POST"
                      )
                    }
                    className={`
                      text-sm
                      px-4
                      py-1.5
                      rounded-full
                      border
                      transition
                      whitespace-nowrap
                      flex-shrink-0
                      font-medium
                      ${
                        postType ===
                        "POST"
                          ? "bg-zrp-red text-white border-zrp-red shadow-sm"
                          : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }
                    `}
                  >
                    {t(
                      "action.post"
                    )}
                  </button>

                  {canPostRecruitment && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePostTypeChange(
                          "RECRUITMENT"
                        )
                      }
                      className={`
                        text-sm
                        px-4
                        py-1.5
                        rounded-full
                        border
                        transition
                        flex
                        items-center
                        gap-1.5
                        whitespace-nowrap
                        flex-shrink-0
                        font-medium
                        ${
                          postType ===
                          "RECRUITMENT"
                            ? "bg-zrp-red text-white border-zrp-red shadow-sm"
                            : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }
                      `}
                    >
                      <Briefcase className="w-3.5 h-3.5" />

                      {t(
                        "composer.recruitment"
                      )}
                    </button>
                  )}

                  {canPublishArticle && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePostTypeChange(
                          "ARTICLE"
                        )
                      }
                      className={`
                        text-sm
                        px-4
                        py-1.5
                        rounded-full
                        border
                        transition
                        flex
                        items-center
                        gap-1.5
                        whitespace-nowrap
                        flex-shrink-0
                        font-medium
                        ${
                          postType ===
                          "ARTICLE"
                            ? "bg-zrp-red text-white border-zrp-red shadow-sm"
                            : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }
                      `}
                    >
                      <FileText className="w-3.5 h-3.5" />

                      {t(
                        "composer.article"
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* ───────────────────────────────────────────── */}
              {/* MAIN TEXT AREA */}
              {/* ───────────────────────────────────────────── */}

              {postType !==
              "ARTICLE" ? (
                <textarea
                  ref={
                    textareaRef
                  }
                  value={
                    content
                  }
                  onChange={
                    handleContentChange
                  }
                  onSelect={(
                    e
                  ) =>
                    setCursorPosition(
                      e.currentTarget
                        .selectionStart ||
                        0
                    )
                  }
                  placeholder={
                    postType ===
                    "RECRUITMENT"
                      ? t(
                          "composer.placeholderRecruitment"
                        )
                      : t(
                          "composer.placeholderDefault"
                        )
                  }
                  className="
                    w-full
                    resize-none
                    border-0
                    focus:ring-0
                    focus:outline-none
                    p-0
                    text-gray-800
                    dark:text-gray-200
                    placeholder-gray-400
                    dark:placeholder-gray-500
                    min-h-[90px]
                    max-h-[280px]
                    overflow-y-auto
                    bg-transparent
                    text-[17px]
                    leading-7
                  "
                  maxLength={
                    postLength
                  }
                  rows={3}
                />
              ) : (
                <div className="space-y-3">

                  <textarea
                    ref={
                      textareaRef
                    }
                    value={
                      content
                    }
                    onChange={
                      handleContentChange
                    }
                    onSelect={(
                      e
                    ) =>
                      setCursorPosition(
                        e.currentTarget
                          .selectionStart ||
                          0
                      )
                    }
                    placeholder={t(
                      "composer.placeholderArticleTitle"
                    )}
                    className="
                      w-full
                      resize-none
                      border-0
                      focus:ring-0
                      focus:outline-none
                      p-0
                      text-gray-900
                      dark:text-white
                      placeholder-gray-400
                      dark:placeholder-gray-500
                      min-h-[45px]
                      bg-transparent
                      text-xl
                      font-semibold
                    "
                    maxLength={
                      postLength
                    }
                  />

                  <textarea
                    value={
                      articleBody
                    }
                    onChange={(
                      e
                    ) => {
                      setArticleBody(
                        e.target.value
                      );

                      e.target.style.height =
                        "auto";

                      e.target.style.height = `${Math.min(
                        e.target
                          .scrollHeight,
                        600
                      )}px`;
                    }}
                    placeholder={t(
                      "composer.placeholderArticleBody"
                    )}
                    className="
                      w-full
                      resize-none
                      border
                      border-gray-200
                      dark:border-gray-700
                      rounded-xl
                      p-3
                      text-gray-800
                      dark:text-gray-200
                      placeholder-gray-400
                      dark:placeholder-gray-500
                      min-h-[220px]
                      bg-gray-50
                      dark:bg-gray-800/50
                      focus:ring-2
                      focus:ring-zrp-red/20
                      focus:border-zrp-red/40
                      outline-none
                      text-sm
                      leading-6
                    "
                  />

                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t(
                      "composer.articleMarkdown"
                    )}
                  </p>
                </div>
              )}

              {/* ───────────────────────────────────────────── */}
              {/* MENTION AUTOCOMPLETE */}
              {/* ───────────────────────────────────────────── */}

              <MentionAutocomplete
                text={
                  content
                }
                cursorPosition={
                  cursorPosition
                }
                onSelect={
                  handleMentionSelect
                }
                onClose={() => {}}
              />

              {/* ───────────────────────────────────────────── */}
              {/* RECRUITMENT */}
              {/* ───────────────────────────────────────────── */}

              {postType ===
                "RECRUITMENT" && (
                <div
                  className="
                    mt-3
                    p-3
                    sm:p-4
                    bg-gray-50
                    dark:bg-gray-800/50
                    rounded-xl
                    border
                    border-gray-200
                    dark:border-gray-700
                    space-y-2
                  "
                >
                  <input
                    type="text"
                    value={
                      company
                    }
                    onChange={(
                      e
                    ) =>
                      setCompany(
                        e.target.value
                      )
                    }
                    placeholder={t(
                      "composer.companyPlaceholder"
                    )}
                    className="
                      w-full
                      px-3
                      py-2
                      border
                      border-gray-300
                      dark:border-gray-600
                      rounded-lg
                      bg-white
                      dark:bg-zrp-deepBlack
                      text-gray-900
                      dark:text-white
                      text-sm
                      outline-none
                      focus:ring-2
                      focus:ring-zrp-red/20
                      focus:border-zrp-red/40
                    "
                    required
                  />

                  <input
                    type="text"
                    value={
                      location
                    }
                    onChange={(
                      e
                    ) =>
                      setLocation(
                        e.target.value
                      )
                    }
                    placeholder={t(
                      "composer.locationPlaceholder"
                    )}
                    className="
                      w-full
                      px-3
                      py-2
                      border
                      border-gray-300
                      dark:border-gray-600
                      rounded-lg
                      bg-white
                      dark:bg-zrp-deepBlack
                      text-gray-900
                      dark:text-white
                      text-sm
                      outline-none
                      focus:ring-2
                      focus:ring-zrp-red/20
                      focus:border-zrp-red/40
                    "
                  />

                  <input
                    type="url"
                    value={
                      applyUrl
                    }
                    onChange={(
                      e
                    ) =>
                      setApplyUrl(
                        e.target.value
                      )
                    }
                    placeholder={t(
                      "composer.applyUrlPlaceholder"
                    )}
                    className="
                      w-full
                      px-3
                      py-2
                      border
                      border-gray-300
                      dark:border-gray-600
                      rounded-lg
                      bg-white
                      dark:bg-zrp-deepBlack
                      text-gray-900
                      dark:text-white
                      text-sm
                      outline-none
                      focus:ring-2
                      focus:ring-zrp-red/20
                      focus:border-zrp-red/40
                    "
                  />
                </div>
              )}

              {/* ───────────────────────────────────────────── */}
              {/* ERROR */}
              {/* ───────────────────────────────────────────── */}

              {error && (
                <div
                  className="
                    mt-3
                    rounded-xl
                    border
                    border-red-200
                    dark:border-red-900/50
                    bg-red-50
                    dark:bg-red-950/20
                    px-3
                    py-2
                    text-red-600
                    dark:text-red-400
                    text-sm
                  "
                >
                  {error}
                </div>
              )}

              {/* ───────────────────────────────────────────── */}
              {/* SCHEDULE + COMMENTS */}
              {/* ───────────────────────────────────────────── */}

              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  gap-2
                  sm:gap-3
                  mt-4
                "
              >
                {canSchedule && (
                  <button
                    type="button"
                    onClick={
                      handleScheduleToggle
                    }
                    className={`
                      text-sm
                      flex
                      items-center
                      gap-1.5
                      px-3
                      py-1.5
                      rounded-full
                      border
                      transition
                      ${
                        schedulePost
                          ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                          : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }
                    `}
                  >
                    <Clock className="w-4 h-4" />

                    {schedulePost
                      ? t(
                          "composer.scheduleOn"
                        )
                      : t(
                          "composer.schedule"
                        )}
                  </button>
                )}

                {schedulePost && (
                  <input
                    type="datetime-local"
                    value={
                      scheduledAt
                    }
                    onChange={(
                      e
                    ) =>
                      setScheduledAt(
                        e.target.value
                      )
                    }
                    className="
                      text-sm
                      border
                      border-gray-300
                      dark:border-gray-600
                      rounded-lg
                      px-2.5
                      py-1.5
                      bg-white
                      dark:bg-gray-800
                      text-gray-900
                      dark:text-white
                      outline-none
                      focus:ring-2
                      focus:ring-zrp-red/20
                    "
                  />
                )}

                <label
                  className="
                    flex
                    items-center
                    gap-2
                    text-sm
                    text-gray-500
                    dark:text-gray-400
                    cursor-pointer
                    select-none
                  "
                >
                  <input
                    type="checkbox"
                    checked={
                      commentsEnabled
                    }
                    onChange={(
                      e
                    ) =>
                      setCommentsEnabled(
                        e.target
                          .checked
                      )
                    }
                    className="
                      w-4
                      h-4
                      rounded
                      border-gray-300
                      dark:border-gray-600
                      text-zrp-red
                      focus:ring-zrp-red
                    "
                  />

                  <span>
                    {t(
                      "composer.allowComments"
                    )}
                  </span>
                </label>
              </div>

              {/* ───────────────────────────────────────────── */}
              {/* POLL BUILDER */}
              {/* ───────────────────────────────────────────── */}

              {showPollBuilder &&
                canCreatePoll && (
                  <div
                    className="
                      mt-3
                      p-4
                      bg-gray-50
                      dark:bg-gray-800/60
                      rounded-xl
                      border
                      border-gray-200
                      dark:border-gray-700
                    "
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">
                        {t(
                          "composer.addPoll"
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setShowPollBuilder(
                            false
                          )
                        }
                        className="
                          p-1.5
                          rounded-full
                          text-gray-400
                          hover:bg-gray-200
                          dark:hover:bg-gray-700
                        "
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={
                        pollQuestion
                      }
                      onChange={(
                        e
                      ) =>
                        setPollQuestion(
                          e.target.value.slice(
                            0,
                            pollQuestionMaxLength
                          )
                        )
                      }
                      placeholder={t(
                        "composer.pollQuestion"
                      )}
                      className="
                        w-full
                        px-3
                        py-2
                        border
                        border-gray-300
                        dark:border-gray-600
                        rounded-lg
                        bg-white
                        dark:bg-zrp-deepBlack
                        text-gray-900
                        dark:text-white
                        text-sm
                        outline-none
                        focus:ring-2
                        focus:ring-zrp-red/20
                        focus:border-zrp-red/40
                      "
                      maxLength={
                        pollQuestionMaxLength
                      }
                    />

                    <div className="mt-3 space-y-2">
                      {pollOptions.map(
                        (
                          option,
                          idx
                        ) => (
                          <div
                            key={
                              idx
                            }
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={
                                option
                              }
                              onChange={(
                                e
                              ) =>
                                updatePollOption(
                                  idx,
                                  e
                                    .target
                                    .value
                                )
                              }
                              placeholder={t(
                                "composer.option",
                                {
                                  n:
                                    idx +
                                    1,
                                }
                              )}
                              className="
                                flex-1
                                px-3
                                py-2
                                border
                                border-gray-300
                                dark:border-gray-600
                                rounded-lg
                                bg-white
                                dark:bg-zrp-deepBlack
                                text-gray-900
                                dark:text-white
                                text-sm
                                outline-none
                                focus:ring-2
                                focus:ring-zrp-red/20
                                focus:border-zrp-red/40
                              "
                              maxLength={
                                pollOptionMaxLength
                              }
                            />

                            {pollOptions.length >
                              2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  removePollOption(
                                    idx
                                  )
                                }
                                className="
                                  p-2
                                  text-red-500
                                  hover:bg-red-50
                                  dark:hover:bg-red-900/20
                                  rounded-lg
                                "
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>

                    <div
                      className="
                        flex
                        flex-wrap
                        items-center
                        justify-between
                        gap-3
                        mt-3
                      "
                    >
                      <button
                        type="button"
                        onClick={
                          addPollOption
                        }
                        disabled={
                          pollOptions.length >=
                          pollMaxOptions
                        }
                        className="
                          text-zrp-red
                          text-sm
                          hover:underline
                          disabled:opacity-50
                          disabled:cursor-not-allowed
                          font-medium
                        "
                      >
                        <Plus className="w-4 h-4 inline mr-1" />

                        {t(
                          "composer.addOption"
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500 dark:text-gray-400">
                          {t(
                            "composer.ends"
                          )}
                        </label>

                        <input
                          type="datetime-local"
                          value={
                            pollExpiry
                          }
                          onChange={(
                            e
                          ) =>
                            setPollExpiry(
                              e.target
                                .value
                            )
                          }
                          className="
                            px-2
                            py-1.5
                            border
                            border-gray-300
                            dark:border-gray-600
                            rounded-lg
                            bg-white
                            dark:bg-zrp-deepBlack
                            text-gray-900
                            dark:text-white
                            text-sm
                            outline-none
                          "
                        />
                      </div>
                    </div>
                  </div>
                )}

              {/* ───────────────────────────────────────────── */}
              {/* MEDIA PREVIEW */}
              {/* ───────────────────────────────────────────── */}

              {imageUrls.length >
                0 && (
                <div
                  className={`
                    relative
                    mt-4
                    rounded-2xl
                    overflow-hidden
                    grid
                    gap-0.5
                    ${
                      mediaType ===
                        "video" ||
                      imageUrls.length ===
                        1
                        ? "grid-cols-1"
                        : imageUrls.length ===
                          2
                        ? "grid-cols-2"
                        : "grid-cols-2 grid-rows-2"
                    }
                  `}
                >
                  {mediaType ===
                  "video" ? (
                    <div className="relative bg-black rounded-2xl overflow-hidden">
                      <video
                        src={
                          imageUrls[0]
                        }
                        controls
                        playsInline
                        className="
                          max-h-[420px]
                          w-full
                          object-contain
                        "
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setImageUrls(
                            []
                          );
                          setMediaType(
                            null
                          );
                        }}
                        className="
                          absolute
                          top-3
                          right-3
                          bg-black/60
                          text-white
                          rounded-full
                          p-2
                          hover:bg-black/80
                          transition
                        "
                        aria-label="Remove video"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    imageUrls.map(
                      (
                        url,
                        idx
                      ) => (
                        <div
                          key={
                            url
                          }
                          className={`
                            relative
                            bg-gray-100
                            dark:bg-gray-800
                            overflow-hidden
                            ${
                              imageUrls.length ===
                                3 &&
                              idx ===
                                0
                                ? "row-span-2"
                                : ""
                            }
                          `}
                        >
                          <img
                            src={
                              url
                            }
                            alt={`Upload preview ${
                              idx +
                              1
                            }`}
                            className={`
                              w-full
                              object-cover
                              ${
                                imageUrls.length ===
                                1
                                  ? "max-h-[420px]"
                                  : "h-40 sm:h-48"
                              }
                            `}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              setImageUrls(
                                (
                                  prev
                                ) =>
                                  prev.filter(
                                    (
                                      u
                                    ) =>
                                      u !==
                                      url
                                  )
                              );
                            }}
                            className="
                              absolute
                              top-2
                              right-2
                              bg-black/60
                              text-white
                              rounded-full
                              p-1.5
                              hover:bg-black/80
                              transition
                            "
                            aria-label={`Remove image ${
                              idx +
                              1
                            }`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              )}

              {/* ───────────────────────────────────────────── */}
              {/* BOTTOM TOOLBAR */}
              {/* ───────────────────────────────────────────── */}

              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  justify-between
                  gap-3
                  mt-4
                  pt-3
                  border-t
                  border-gray-100
                  dark:border-gray-700
                "
              >
                <div
                  className="
                    flex
                    items-center
                    gap-4
                    flex-wrap
                    min-w-0
                  "
                >

                  {/* IMAGE / VIDEO */}
                  <label
                    className={`
                      relative
                      transition
                      ${
                        uploading ||
                        !canAddMoreImages
                          ? "cursor-not-allowed opacity-40"
                          : "cursor-pointer text-gray-500 dark:text-gray-400 hover:text-zrp-red"
                      }
                    `}
                    title={
                      maxImages > 0
                        ? `${imageUrls.length}/${maxImages} media`
                        : "Media unavailable for this plan"
                    }
                  >
                    <input
                      ref={
                        fileInputRef
                      }
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={
                        handleFileUpload
                      }
                      className="hidden"
                      disabled={
                        uploading ||
                        !canAddMoreImages
                      }
                    />

                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Image className="w-5 h-5" />
                    )}
                  </label>

                  {/* GIF */}
                  {canUseGif && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowGifPicker(
                          true
                        )
                      }
                      disabled={
                        !canAddMoreImages ||
                        uploading
                      }
                      className="
                        text-gray-500
                        dark:text-gray-400
                        hover:text-zrp-red
                        disabled:opacity-40
                        disabled:cursor-not-allowed
                        transition
                      "
                      title={t(
                        "composer.addGif"
                      )}
                    >
                      <FileImage className="w-5 h-5" />
                    </button>
                  )}

                  {/* EMOJI */}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        textareaRef.current
                      ) {
                        setCursorPosition(
                          textareaRef
                            .current
                            .selectionStart ||
                            0
                        );
                      }

                      setShowEmojiPicker(
                        (value) =>
                          !value
                      );
                    }}
                    className={`
                      text-gray-500
                      dark:text-gray-400
                      hover:text-zrp-red
                      transition
                      ${
                        showEmojiPicker
                          ? "text-zrp-red dark:text-zrp-red"
                          : ""
                      }
                    `}
                    title="Add emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {/* POLL */}
                  {postType ===
                    "POST" &&
                    canCreatePoll && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowPollBuilder(
                            (
                              value
                            ) =>
                              !value
                          )
                        }
                        className={`
                          text-gray-500
                          dark:text-gray-400
                          hover:text-zrp-red
                          transition
                          ${
                            showPollBuilder
                              ? "text-zrp-red dark:text-zrp-red"
                              : ""
                          }
                        `}
                        title={t(
                          "composer.addPoll"
                        )}
                      >
                        <BarChart3 className="w-5 h-5" />
                      </button>
                    )}

                  {/* MEDIA COUNTER */}
                  {maxImages >
                    0 && (
                    <span
                      className="
                        text-xs
                        text-gray-400
                        dark:text-gray-500
                        whitespace-nowrap
                      "
                    >
                      {imageUrls.length}/
                      {maxImages}
                    </span>
                  )}

                  {/* CHARACTER COUNTER */}
                  {postType !==
                    "ARTICLE" && (
                    <span
                      className={`
                        text-xs
                        whitespace-nowrap
                        ${
                          isOverLimit
                            ? "text-red-500 font-medium"
                            : remaining <=
                              Math.max(
                                20,
                                Math.floor(
                                  postLength *
                                    0.1
                                )
                              )
                            ? "text-amber-500"
                            : "text-gray-400 dark:text-gray-500"
                        }
                      `}
                    >
                      {
                        content.length
                      }
                      /
                      {
                        postLength
                      }
                    </span>
                  )}

                  {/* PLAN BADGE */}
                  <span
                    className="
                      text-xs
                      text-gray-500
                      dark:text-gray-400
                      bg-gray-100
                      dark:bg-gray-800
                      px-2.5
                      py-1
                      rounded-full
                      whitespace-nowrap
                    "
                    title={`Account plan: ${plan}`}
                  >
                    {plan
                      .charAt(
                        0
                      )
                      .toUpperCase() +
                      plan.slice(
                        1
                      )}
                  </span>
                </div>

                {/* ─────────────────────────────────────────── */}
                {/* POST BUTTON */}
                {/* ─────────────────────────────────────────── */}

                <button
                  type="submit"
                  disabled={
                    isSubmitDisabled
                  }
                  className="
                    bg-zrp-red
                    text-white
                    px-5
                    sm:px-6
                    py-2
                    rounded-full
                    text-sm
                    font-semibold
                    hover:bg-zrp-darkRed
                    disabled:opacity-40
                    disabled:cursor-not-allowed
                    transition
                    whitespace-nowrap
                    flex-shrink-0
                    shadow-sm
                  "
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />

                      {t(
                        "composer.posting"
                      )}
                    </span>
                  ) : schedulePost ? (
                    t(
                      "composer.scheduleButton"
                    )
                  ) : (
                    t(
                      "composer.postButton"
                    )
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ───────────────────────────────────────────────────────── */}
      {/* GIF PICKER */}
      {/* ───────────────────────────────────────────────────────── */}

      {showGifPicker &&
        canUseGif && (
          <GifPicker
            onSelect={
              handleGifSelect
            }
            onClose={() =>
              setShowGifPicker(
                false
              )
            }
          />
        )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* EMOJI PICKER */}
      {/* ───────────────────────────────────────────────────────── */}

      {showEmojiPicker && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-end
            sm:items-center
            sm:justify-center
            bg-black/40
            backdrop-blur-[2px]
          "
          onClick={() =>
            setShowEmojiPicker(
              false
            )
          }
        >
          <div
            className="
              bg-white
              dark:bg-gray-800
              rounded-t-2xl
              sm:rounded-2xl
              w-full
              sm:w-auto
              max-w-[420px]
              p-2
              shadow-2xl
              overflow-hidden
            "
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() =>
                  setShowEmojiPicker(
                    false
                  )
                }
                className="
                  p-1.5
                  rounded-full
                  text-gray-500
                  hover:bg-gray-100
                  dark:hover:bg-gray-700
                "
                aria-label="Close emoji picker"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <EmojiPicker
              onEmojiClick={
                handleEmojiSelect
              }
              width="100%"
              height={380}
            />
          </div>
        </div>
      )}
    </div>
  );
}
