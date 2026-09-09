"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback, use } from "react";
import Link from "next/link";
import {
  MapPin,
  Link as LinkIcon,
  Calendar,
  Users,
  Pencil,
  Pin,
  PinOff,
  Heart,
  Camera,
  Loader2,
  MessageCircle,
  UserPlus,
  UserCheck,
  Share2,
  Eye,
  Bell,
  BellOff,
  Ban,
  CheckCircle,
  ShieldCheck,
  MoreHorizontal,
  ChevronRight,
  DollarSign,
  Lock,
  FileText,
  Repeat,
  MessageSquare,
  Image as ImageIcon,
  Award,
  Sparkles,
} from "lucide-react";

import PostCard from "@/components/PostCard";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import VerifiedBadge from "@/components/VerifiedBadge";
import AnalyticsTab from "@/components/AnalyticsTab";
import TipModal from "@/components/TipModal";
import NativePaymentNotice from "@/components/NativePaymentNotice";
import { SkeletonProfileHeader } from "@/components/skeletons/SkeletonProfileHeader";
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";
import { isNativeApp } from "@/lib/nativeAuth";
import { isNativeStoreRestrictedPayment } from "@/lib/native-payment-policy";

function formatProfileCount(n: number) {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  if (n >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }

  return n.toString();
}

// ─── Parse bio for @mentions, #hashtags, and URLs ───────────────────

function parseBio(bio: string) {
  const parts: {
    type: "text" | "mention" | "hashtag" | "url";
    value: string;
  }[] = [];

  let lastIndex = 0;

  const regex = /(@\w+)|(#\w+)|(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;

  const trailingPunctuation = /[.,!?;:'")\]}]+$/;

  let match;

  while ((match = regex.exec(bio)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: bio.slice(lastIndex, match.index),
      });
    }

    const raw = match[0];

    const type: "mention" | "hashtag" | "url" =
      raw.startsWith("@")
        ? "mention"
        : raw.startsWith("#")
        ? "hashtag"
        : "url";

    if (type === "url") {
      const trailingMatch = raw.match(trailingPunctuation);

      const trimmed = trailingMatch
        ? raw.slice(0, raw.length - trailingMatch[0].length)
        : raw;

      if (trailingMatch && trimmed.length > 0) {
        parts.push({
          type: "url",
          value: trimmed,
        });

        parts.push({
          type: "text",
          value: trailingMatch[0],
        });

        lastIndex = match.index + raw.length;
        continue;
      }
    }

    parts.push({
      type,
      value: raw,
    });

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < bio.length) {
    parts.push({
      type: "text",
      value: bio.slice(lastIndex),
    });
  }

  return parts;
}

// ─── Milestone badges ────────────────────────────────────────────────
// The facts themselves (which thresholds a profile has crossed) now come
// from the API (src/lib/milestones.ts) instead of being recomputed here,
// so web, Android and iOS can never disagree on which badges a profile
// has earned. Only the key -> localized label mapping stays client-side,
// matching every key computeMilestones() can produce.
const MILESTONE_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  years_on_zrp: "profile.milestoneYearsOnZRP",
  six_months: "profile.milestoneSixMonths",
  new_member: "profile.milestoneNewMember",
  posts_500: "profile.milestonePosts500",
  posts_100: "profile.milestonePosts100",
  posts_10: "profile.milestonePosts10",
  followers_1k: "profile.milestoneFollowers1k",
  followers_100: "profile.milestoneFollowers100",
};

function milestoneLabel(
  fact: { key: string; params?: Record<string, number> },
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  const translationKey = MILESTONE_TRANSLATION_KEYS[fact.key];
  if (!translationKey) return fact.key;
  return t(translationKey, fact.params);
}

interface UserProfile {
  id: string;
  username: string;
  customUrl: string | null;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  location: string | null;
  website: string | null;
  badgeType: string | null;
  category: string | null;
  showCategory: boolean;
  createdAt: string;
  isAdmin: boolean;
  plan: string | null;
  publicLikes: boolean;
  publicFollowing: boolean;
  isPrivate: boolean;
  solanaWallet: string | null;

  creatorProfile: {
    tipsEnabled: boolean;
  } | null;

  _count: {
    posts: number;
    followers: number;
    following: number;
  };

  pinnedPostId: string | null;

  isFollowing: boolean;
  isBlocked: boolean;
  // Does this profile follow the viewer back - X's "Follows you" signal.
  // Independent of isFollowing (the other direction); see
  // src/app/api/users/[username]/route.ts.
  followsMe: boolean;

  followRequestStatus?: "pending" | "none";

  charityContributionUsdc: number;
  milestones: { key: string; icon: string; params?: Record<string, number> }[];
}

interface Post {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  views?: number;

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

  replyTo?: {
    id: string;
    content: string;
    author: {
      username: string;
      name: string | null;
    };
  };

  postId?: string;
}

type TabType =
  | "posts"
  | "replies"
  | "media"
  | "likes"
  | "reposts"
  | "analytics";

// ─── Icon per tab ─────────────────────────────────────────────────

const tabIconMap: Record<
  Exclude<TabType, "analytics">,
  React.ElementType
> = {
  posts: FileText,
  reposts: Repeat,
  replies: MessageSquare,
  likes: Heart,
  media: ImageIcon,
};

export default function ProfilePage(
  props: {
    params: Promise<{ username: string }>;
  }
) {
  const params = use(props.params);
  const { data: session, status } = useSession();

  const router = useRouter();

  const { t, language } = useLanguage();

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [pinnedPost, setPinnedPost] =
    useState<Post | null>(null);

  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<TabType>("posts");

  const [uploadingBanner, setUploadingBanner] =
    useState(false);

  const [uploadingAvatar, setUploadingAvatar] =
    useState(false);

  const [isFollowing, setIsFollowing] =
    useState(false);

  const [followLoading, setFollowLoading] =
    useState(false);

  const [followRequestStatus, setFollowRequestStatus] =
    useState<"none" | "pending">("none");

  // ─── MUTE STATE ────────────────────────────────────────────────

  const [isMuted, setIsMuted] = useState(false);

  const [muteLoading, setMuteLoading] =
    useState(false);

  // ─── BLOCK STATE ───────────────────────────────────────────────

  const [isBlocked, setIsBlocked] =
    useState(false);

  const [blockLoading, setBlockLoading] =
    useState(false);

  // ─── MORE DROPDOWN ─────────────────────────────────────────────

  const [moreMenuOpen, setMoreMenuOpen] =
    useState(false);

  const moreMenuRef =
    useRef<HTMLDivElement>(null);

  // ─── TIP MODAL STATE ───────────────────────────────────────────

  const [showTipModal, setShowTipModal] =
    useState(false);

  const [showTipNativeNotice, setShowTipNativeNotice] =
    useState(false);

  const bannerInputRef =
    useRef<HTMLInputElement>(null);

  const avatarInputRef =
    useRef<HTMLInputElement>(null);

  const isOwnProfile =
    session?.user?.id === profile?.id;

  const localeMap: Record<string, string> = {
    en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
    es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
  };

  // ─── Click outside to close dropdown ───────────────────────────

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(
          event.target as Node
        )
      ) {
        setMoreMenuOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  // ─── Fetch profile & follow & mute & block status ──────────────

  const fetchProfile = async () => {
    try {
      const res = await fetch(
        `/api/users/${params.username}`
      );

      if (!res.ok) {
        setProfile(null);
        return;
      }

      const data = await res.json();

      setProfile(data);

      setIsFollowing(
        data.isFollowing || false
      );

      setIsBlocked(
        data.isBlocked || false
      );

      setFollowRequestStatus(
        data.followRequestStatus || "none"
      );

      if (data.pinnedPostId) {
        fetchPinnedPost(
          data.pinnedPostId
        );
      } else {
        setPinnedPost(null);
      }

      // ─── Fetch mute status ─────────────────────────────────────

      if (
        session?.user?.id &&
        data.id !== session.user.id
      ) {
        const muteRes = await fetch(
          `/api/users/mute?userId=${data.id}`
        );

        if (muteRes.ok) {
          const muteData =
            await muteRes.json();

          setIsMuted(muteData.muted);
        }
      }
    } catch (error) {
      console.error(
        "Error fetching profile:",
        error
      );

      setProfile(null);
    }
  };

  const fetchPinnedPost = async (
    postId: string
  ) => {
    try {
      const res = await fetch(
        `/api/posts/${postId}`
      );

      if (res.ok) {
        const data = await res.json();

        setPinnedPost(data);
      }
    } catch (error) {
      console.error(
        "Error fetching pinned post:",
        error
      );
    }
  };

  // ─── Fetch posts based on active tab ──────────────────────────

  const getTabEndpoint = useCallback(
    () => {
      if (activeTab === "replies") {
        return `/api/users/${params.username}/replies`;
      } else if (activeTab === "media") {
        return `/api/users/${params.username}/media`;
      } else if (activeTab === "likes") {
        return `/api/users/${params.username}/likes`;
      } else if (activeTab === "reposts") {
        return `/api/users/${params.username}/reposts`;
      }
      return `/api/users/${params.username}/posts`;
    },
    [params.username, activeTab]
  );

  const fetchPosts = useCallback(
    async () => {
      setLoading(true);
      setNextCursor(null);

      try {
        const res = await fetch(getTabEndpoint());
        const data = await res.json();

        // Tabs that don't support pagination (e.g. "analytics" isn't
        // fetched through this path at all) still get a bare array
        // from some code paths - handle both shapes defensively so a
        // partially-migrated response never crashes the page.
        if (Array.isArray(data)) {
          setPosts(data);
          setNextCursor(null);
        } else {
          setPosts(data.items || []);
          setNextCursor(data.nextCursor || null);
        }
      } catch (error) {
        console.error(
          "Error fetching posts:",
          error
        );
      } finally {
        setLoading(false);
      }
    },
    [getTabEndpoint]
  );

  const loadMorePosts = useCallback(
    async () => {
      if (!nextCursor || loadingMore) return;
      setLoadingMore(true);

      try {
        const separator = getTabEndpoint().includes("?") ? "&" : "?";
        const res = await fetch(`${getTabEndpoint()}${separator}cursor=${nextCursor}`);
        const data = await res.json();

        if (!Array.isArray(data)) {
          setPosts((prev) => [...prev, ...(data.items || [])]);
          setNextCursor(data.nextCursor || null);
        }
      } catch (error) {
        console.error(
          "Error loading more posts:",
          error
        );
      } finally {
        setLoadingMore(false);
      }
    },
    [getTabEndpoint, nextCursor, loadingMore]
  );

  // ─── Authentication ────────────────────────────────────────────

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // ─── Load profile ──────────────────────────────────────────────

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    }
  }, [params.username, status]);

  // ─── Load posts ────────────────────────────────────────────────

  useEffect(() => {
    if (
      status === "authenticated" &&
      profile
    ) {
      fetchPosts();
    }
  }, [
    activeTab,
    profile,
    status,
    fetchPosts,
  ]);

  // ─── Follow / Unfollow ─────────────────────────────────────────

  const handleFollow = async () => {
    if (!session || isOwnProfile) return;

    setFollowLoading(true);

    try {
      const res = await fetch(
        `/api/users/${params.username}/follow`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: isFollowing
              ? "unfollow"
              : "follow",
          }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        if (data.requested) {
          setFollowRequestStatus(
            "pending"
          );

          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  followRequestStatus:
                    "pending",
                }
              : null
          );
        } else {
          setIsFollowing(
            data.following
          );

          setFollowRequestStatus(
            "none"
          );

          setProfile((prev) => {
            if (!prev) return prev;

            return {
              ...prev,

              _count: {
                ...prev._count,

                followers:
                  data.following
                    ? prev._count.followers + 1
                    : prev._count.followers - 1,
              },

              isFollowing:
                data.following,
            };
          });
        }
      }
    } catch (error) {
      console.error(
        "Follow error:",
        error
      );
    } finally {
      setFollowLoading(false);
    }
  };

  // ─── Mute / Unmute ─────────────────────────────────────────────

  const handleMute = async () => {
    if (
      !session ||
      isOwnProfile ||
      !profile
    ) {
      return;
    }

    setMuteLoading(true);

    try {
      const res = await fetch(
        "/api/users/mute",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: profile.id,
          }),
        }
      );

      if (res.ok) {
        const data =
          await res.json();

        setIsMuted(data.muted);
      } else {
        const err =
          await res.json();

        alert(
          err.error ||
            "Failed to toggle mute"
        );
      }
    } catch (error) {
      console.error(
        "Mute error:",
        error
      );

      alert(
        "Failed to toggle mute"
      );
    } finally {
      setMuteLoading(false);
    }
  };

  // ─── Block / Unblock ───────────────────────────────────────────

  const handleBlock = async () => {
    if (
      !session ||
      isOwnProfile ||
      !profile
    ) {
      return;
    }

    setBlockLoading(true);

    try {
      const method = isBlocked
        ? "DELETE"
        : "POST";

      const res = await fetch(
        `/api/users/${profile.username}/block`,
        {
          method,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );

      if (res.ok) {
        const data =
          await res.json();

        setIsBlocked(
          data.blocked
        );

        fetchProfile();
      } else {
        const err =
          await res.json();

        alert(
          err.error ||
            "Failed to toggle block"
        );
      }
    } catch (error) {
      console.error(
        "Block error:",
        error
      );

      alert(
        "Failed to toggle block"
      );
    } finally {
      setBlockLoading(false);
    }
  };

  // ─── Share Profile ─────────────────────────────────────────────

  const handleShareProfile =
    async () => {
      const shortSlug =
        profile?.customUrl ||
        profile?.username;

      const url = `${window.location.origin}/${shortSlug}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: `${
              profile?.name ||
              profile?.username
            } on ZRP Social`,

            text: `Check out ${
              profile?.name ||
              profile?.username
            }'s profile on ZRP Social!`,

            url,
          });
        } catch {
          // User cancelled
        }
      } else {
        try {
          await navigator.clipboard.writeText(
            url
          );

          alert(
            t("profile.linkCopied")
          );
        } catch {
          alert(
            t(
              "profile.shareNotSupported"
            )
          );
        }
      }
    };

  // ─── Banner upload ─────────────────────────────────────────────

  const handleBannerUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    setUploadingBanner(true);

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "type",
      "cover"
    );

    try {
      const res = await fetch(
        "/api/user/update-cover",
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.ok) {
        const data =
          await res.json();

        setProfile((prev) =>
          prev
            ? {
                ...prev,
                coverUrl:
                  data.coverUrl,
              }
            : null
        );
      } else {
        alert(
          t(
            "profile.uploadBannerFailed"
          )
        );
      }
    } catch (error) {
      console.error(
        "Banner upload error:",
        error
      );

      alert(
        t(
          "profile.uploadBannerFailed"
        )
      );
    } finally {
      setUploadingBanner(false);

      if (
        bannerInputRef.current
      ) {
        bannerInputRef.current.value =
          "";
      }
    }
  };

  // ─── Avatar upload ─────────────────────────────────────────────

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    setUploadingAvatar(true);

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "type",
      "avatar"
    );

    try {
      const res = await fetch(
        "/api/user/update-avatar",
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.ok) {
        const data =
          await res.json();

        setProfile((prev) =>
          prev
            ? {
                ...prev,
                avatarUrl:
                  data.avatarUrl,
              }
            : null
        );
      } else {
        alert(
          t(
            "profile.uploadAvatarFailed"
          )
        );
      }
    } catch (error) {
      console.error(
        "Avatar upload error:",
        error
      );

      alert(
        t(
          "profile.uploadAvatarFailed"
        )
      );
    } finally {
      setUploadingAvatar(false);

      if (
        avatarInputRef.current
      ) {
        avatarInputRef.current.value =
          "";
      }
    }
  };

  // ─── Loading state ─────────────────────────────────────────────

  if (loading && !profile) {
    // A shape-matched skeleton instead of a centred spinner on an
    // otherwise blank page - the same real component
    // (SkeletonProfileHeader) other loading states already use, just
    // never wired up on the profile page itself before this.
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-zrp-deepBlack min-h-screen">
        <div className="h-48 bg-gray-100 dark:bg-gray-900" />
        <SkeletonProfileHeader />
        <div className="px-4 mt-2">
          <SkeletonFeed count={3} />
        </div>
      </div>
    );
  }

  // ─── Not found ─────────────────────────────────────────────────

  if (!profile) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t("profile.userNotFound")}
      </div>
    );
  }

  const joinDate =
    new Date(profile.createdAt);

  const formattedJoinDate =
    joinDate.toLocaleDateString(
      localeMap[language] ||
        "en-US",
      {
        month: "long",
        year: "numeric",
      }
    );

  // Real figure from the API - the sum of this profile's own completed
  // tips/purchases' charityAmount (see src/lib/charity.ts). This used to
  // be `Math.floor(Math.random() * 50) + 5` "meals", a number with no
  // connection to anything real, regenerated on every page load.
  const charityContributionUsdc = profile.charityContributionUsdc;

  // The passport's own translated description, reused verbatim. Writing
  // a new summary line would mean inventing a trust claim and 11
  // translations for it; the real signals it summarises (verification,
  // join date) are rendered from this page's own data.
  const trustSummary = t("profile.trustPassportDesc");

  const milestones = profile.milestones;

  // ─── Plan badge color ──────────────────────────────────────────

  const getPlanBadgeColor = (
    plan: string | null
  ) => {
    if (!plan) {
      return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }

    switch (
      plan.toLowerCase()
    ) {
      case "free":
        return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";

      case "pro":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";

      case "business":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";

      case "enterprise":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";

      default:
        return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const planLabelMap: Record<
    string,
    string
  > = {
    free: t(
      "adminUsers.planFree"
    ),
    pro: t(
      "adminUsers.planPro"
    ),
    business: t(
      "adminUsers.planBusiness"
    ),
    enterprise: t(
      "adminUsers.planEnterprise"
    ),
  };

  const tabLabelMap: Record<
    Exclude<TabType, "analytics">,
    string
  > = {
    posts: t("profile.posts"),
    reposts: t(
      "profile.reposts"
    ),
    replies: t(
      "profile.replies"
    ),
    likes: t("profile.likes"),
    media: t("profile.media"),
  };

  const emptyStateMap: Record<
    Exclude<TabType, "analytics">,
    string
  > = {
    posts: t(
      "profile.noPosts"
    ),
    reposts: t(
      "profile.noReposts"
    ),
    replies: t(
      "profile.noReplies"
    ),
    likes: t(
      "profile.noLikes"
    ),
    media: t(
      "profile.noMedia"
    ),
  };

  // ─── Render reply item ─────────────────────────────────────────

  const renderReplyItem = (
    reply: any
  ) => {
    const postLink = reply.postId
      ? `/post/${reply.postId}#comment-${reply.id}`
      : "#";

    return (
      <Link
        href={postLink}
        className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
      >
        <div className="flex items-start gap-3">
          <Link
            href={`/profile/${reply.author.username}`}
            className="flex-shrink-0"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              {reply.author
                .avatarUrl ? (
                <img
                  src={
                    reply.author
                      .avatarUrl
                  }
                  alt={
                    reply.author
                      .name ||
                    reply.author
                      .username
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                  {(
                    reply.author
                      .name ||
                    reply.author
                      .username
                  )[0].toUpperCase()}
                </div>
              )}
            </div>
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${reply.author.username}`}
                className="font-semibold hover:underline text-gray-900 dark:text-white inline-flex items-center gap-1"
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                {reply.author
                  .name ||
                  reply.author
                    .username}

                <VerifiedBadge
                  badgeType={
                    reply.author
                      .badgeType
                  }
                />
              </Link>

              <span className="text-sm text-gray-500">
                @{reply.author.username}
              </span>

              <span className="text-sm text-gray-400">
                ·
              </span>

              <span className="text-sm text-gray-400">
                {new Date(
                  reply.createdAt
                ).toLocaleDateString(
                  localeMap[
                    language
                  ] || "en-US"
                )}
              </span>
            </div>

            {/* ─── Replying to ─────────────────────────────────── */}

            {reply.replyTo && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t(
                  "profile.replyingTo"
                )}{" "}
                <Link
                  href={`/profile/${reply.replyTo.author.username}`}
                  className="text-zrp-red hover:underline"
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                >
                  @
                  {
                    reply.replyTo
                      .author
                      .username
                  }
                </Link>
              </div>
            )}

            <p className="mt-1 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {reply.content}
            </p>

            {reply.imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img
                  src={
                    reply.imageUrl
                  }
                  alt="Reply image"
                  className="w-full max-h-60 object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  };

  // ─── Privacy ───────────────────────────────────────────────────

  const showLikesTab =
    isOwnProfile ||
    profile.publicLikes !==
      false;

  const showFollowingCount =
    isOwnProfile ||
    profile.publicFollowing !==
      false;

  // ─── Tabs ──────────────────────────────────────────────────────

  const allTabs: TabType[] = [
    "posts",
    "reposts",
    "replies",
    "likes",
    "media",
    "analytics",
  ];

  const visibleTabs =
    allTabs.filter((tab) => {
      if (
        tab === "analytics" &&
        !isOwnProfile
      ) {
        return false;
      }

      if (
        tab === "likes" &&
        !showLikesTab
      ) {
        return false;
      }

      return true;
    });

  // ─── Tips ──────────────────────────────────────────────────────

  const canReceiveTips =
    !isOwnProfile &&
    profile.creatorProfile
      ?.tipsEnabled === true;

  // ─── Private account ───────────────────────────────────────────

  const canViewPosts =
    isOwnProfile ||
    !profile.isPrivate ||
    (isFollowing &&
      !followRequestStatus);

  // ─── Protected account message ─────────────────────────────────

  const renderProtectedMessage =
    () => (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6 mb-4">
          <Lock className="w-12 h-12 text-gray-500 dark:text-gray-400" />
        </div>

        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          {t(
            "profile.protectedAccount"
          )}
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
          {t(
            "profile.protectedMessage"
          )}
        </p>
      </div>
    );

  // ─── Follow request ────────────────────────────────────────────

  const isFollowRequested =
    followRequestStatus ===
    "pending";

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-zrp-deepBlack min-h-screen">
      {/* ───────────────────────────────────────────────────────────
          BANNER
      ─────────────────────────────────────────────────────────── */}

      {/* An account with no cover got a pale red gradient - the brand
          colour used as decoration, and the first of three accents
          stacked in the top 150px of this page. A cover is content; its
          absence is not an occasion for brand colour, so the default is
          now a quiet neutral field. The dark scrim exists to keep the
          avatar and the camera button legible over a photograph, so it
          is now drawn only when there is a photograph. */}
      <div className="relative h-48 bg-gray-100 dark:bg-gray-900">
        {profile.coverUrl && (
          <>
            <img
              src={profile.coverUrl}
              alt="Cover"
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
          </>
        )}

        {isOwnProfile && (
          <div className="absolute bottom-2 right-2">
            <button
              onClick={() =>
                bannerInputRef.current?.click()
              }
              disabled={
                uploadingBanner
              }
              className="flex items-center justify-center h-11 w-11 bg-black/50 text-white rounded-full hover:bg-black/70 transition"
              aria-label={t(
                "profile.changeBanner"
              )}
              title={t(
                "profile.changeBanner"
              )}
            >
              {uploadingBanner ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </button>

            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={
                handleBannerUpload
              }
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────
          PROFILE INFO
      ─────────────────────────────────────────────────────────── */}

      <div className="px-4 relative z-10">
        {/* Avatar + action buttons row */}

        <div className="flex items-start justify-between gap-3">
          <div // The ring reads as a ring only when it is the ground colour behind
          // the page. It was gray-900 in dark mode while the page ground is
          // zrp-deepBlack (#050505), so it drew as a visible grey band. The
          // shadow goes with it: the ring already separates the avatar from
          // any cover.
          className="relative w-20 h-20 -mt-10 sm:w-28 sm:h-28 sm:-mt-16 rounded-full border-4 border-white dark:border-zrp-deepBlack overflow-hidden flex-shrink-0 group bg-white dark:bg-zrp-deepBlack">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={
                  profile.name ||
                  profile.username
                }
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700">
                {(
                  profile.name ||
                  profile.username
                )[0].toUpperCase()}
              </div>
            )}

            {isOwnProfile && (
              <>
                <button
                  onClick={() =>
                    avatarInputRef.current?.click()
                  }
                  disabled={
                    uploadingAvatar
                  }
                  className="absolute inset-0 bg-black/40 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center text-white"
                  aria-label={t(
                    "profile.changeAvatar"
                  )}
                  title={t(
                    "profile.changeAvatar"
                  )}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6" />
                  )}
                </button>

                <input
                  ref={
                    avatarInputRef
                  }
                  type="file"
                  accept="image/*"
                  onChange={
                    handleAvatarUpload
                  }
                  className="hidden"
                />
              </>
            )}
          </div>

          {/* Primary actions sit on the avatar's line, right-aligned,
              the way every mature profile does it: the identity block
              below then reads as one uninterrupted column of name,
              handle, category, bio and metadata. Batch 06 had moved
              these under the identity block, which left the whole band
              beside a 112px avatar empty and pushed the counts down. */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {/* Share Profile */}

            <button
              onClick={
                handleShareProfile
              }
              className="inline-flex items-center gap-1.5 h-11 px-4 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />

              <span>
                {t(
                  "profile.share"
                )}
              </span>
            </button>

            {isOwnProfile ? (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 h-11 px-4 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
              >
                <Pencil className="w-4 h-4" />

                <span>
                  {t(
                    "profile.edit"
                  )}
                </span>
              </Link>
            ) : (
              <>
                {/* Blocked: this viewer has blocked this account. Follow,
                    Message and Tip all imply an interaction that block is
                    meant to prevent, so - like every mature reference
                    profile - they're replaced with a single quiet
                    indicator rather than left active and misleading. The
                    only way back is the same More menu's own Unblock
                    item, still reachable below. */}
                {isBlocked && (
                  <span className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 whitespace-nowrap">
                    <Ban className="w-4 h-4" />
                    {t("profile.blocked")}
                  </span>
                )}

                {!isBlocked && (
                  <>
                {/* Follow */}

                <button
                  onClick={
                    handleFollow
                  }
                  disabled={
                    followLoading
                  }
                  className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-semibold transition whitespace-nowrap ${
                    isFollowRequested
                      ? "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 cursor-default"
                      : isFollowing
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                  }`}
                >
                  {followLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isFollowRequested ? (
                    t("action.requested")
                  ) : isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />

                      <span>
                        {t(
                          "action.following"
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />

                      <span>
                        {t(
                          "action.follow"
                        )}
                      </span>
                    </>
                  )}
                </button>

                {/* Message */}

                <Link
                  href={`/messages/${profile.username}`}
                  className="inline-flex items-center gap-1.5 h-11 px-4 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />

                  <span>
                    {t(
                      "action.message"
                    )}
                  </span>
                </Link>

                {/* Tip */}

                {canReceiveTips && (
                  <button
                    onClick={() =>
                      isNativeStoreRestrictedPayment("tips", isNativeApp())
                        ? setShowTipNativeNotice(true)
                        : setShowTipModal(true)
                    }
                    className="flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
                  >
                    <DollarSign className="w-4 h-4" />

                    <span>
                      {t(
                        "profile.tip"
                      )}
                    </span>
                  </button>
                )}
                  </>
                )}

                {/* More */}

                <div
                  className="relative"
                  ref={
                    moreMenuRef
                  }
                >
                  <button
                    onClick={() =>
                      setMoreMenuOpen(
                        !moreMenuOpen
                      )
                    }
                    className="inline-flex items-center justify-center h-11 w-11 border border-gray-300 dark:border-gray-600 rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    aria-label={t("profile.moreActions")}
                    aria-haspopup="menu"
                    aria-expanded={moreMenuOpen}
                    title={t(
                      "profile.moreActions"
                    )}
                  >
                    <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                      {/* Mute */}

                      <button
                        onClick={() => {
                          handleMute();
                          setMoreMenuOpen(
                            false
                          );
                        }}
                        disabled={
                          muteLoading
                        }
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        {muteLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isMuted ? (
                          <>
                            <BellOff className="w-4 h-4" />

                            {t(
                              "profile.unmute"
                            )}
                          </>
                        ) : (
                          <>
                            <Bell className="w-4 h-4" />

                            {t(
                              "profile.mute"
                            )}
                          </>
                        )}
                      </button>

                      {/* Block */}

                      <button
                        onClick={() => {
                          handleBlock();

                          setMoreMenuOpen(
                            false
                          );
                        }}
                        disabled={
                          blockLoading
                        }
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition border-t border-gray-200 dark:border-gray-700"
                      >
                        {blockLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isBlocked ? (
                          <>
                            <CheckCircle className="w-4 h-4" />

                            {t(
                              "profile.unblock"
                            )}
                          </>
                        ) : (
                          <>
                            <Ban className="w-4 h-4" />

                            {t(
                              "profile.block"
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────
            NAME / BIO
        ───────────────────────────────────────────────────────── */}

        <div className="mt-3 w-full">
          <div className="flex items-center gap-1 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white break-words">
              {profile.name ||
                profile.username}
            </h1>

            {profile.badgeType && (
              <VerifiedBadge
                badgeType={
                  profile.badgeType
                }
              />
            )}

            {profile.isPrivate &&
              !isOwnProfile && (
                <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-1" />
              )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              @{profile.username}
            </p>

            {/* "Follows you" - the reverse of isFollowing (does THIS
                account follow the viewer), a real reference-app signal
                that was simply never computed before (see the API
                route's own followsMe). Quiet, informational - a chip,
                never a second accent competing with the Follow button
                above. */}
            {!isOwnProfile && profile.followsMe && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                {t("profile.followsYou")}
              </span>
            )}
          </div>

          {/* Category reads as a caption on the person, so it sits
              with the rest of the metadata rather than between the
              handle and the bio, where it interrupted the identity
              line. Quiet, too: it is a fact about the account, not a
              second brand accent competing with the actions above. */}

          {profile.category &&
            profile.showCategory && (
              <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                {profile.category}
              </p>
            )}

          {/* Bio */}

          {profile.bio && (
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {parseBio(
                profile.bio
              ).map(
                (
                  part,
                  index
                ) => {
                  if (
                    part.type ===
                    "mention"
                  ) {
                    const username =
                      part.value.slice(
                        1
                      );

                    return (
                      <Link
                        key={
                          index
                        }
                        href={`/profile/${username}`}
                        className="text-zrp-red hover:underline"
                      >
                        {
                          part.value
                        }
                      </Link>
                    );
                  }

                  if (
                    part.type ===
                    "hashtag"
                  ) {
                    const tag =
                      part.value.slice(
                        1
                      );

                    return (
                      <Link
                        key={
                          index
                        }
                        href={`/hashtag/${tag}`}
                        className="text-zrp-red hover:underline"
                      >
                        {
                          part.value
                        }
                      </Link>
                    );
                  }

                  if (
                    part.type ===
                    "url"
                  ) {
                    const href =
                      part.value.startsWith(
                        "http"
                      )
                        ? part.value
                        : `https://${part.value}`;

                    return (
                      <a
                        key={
                          index
                        }
                        href={
                          href
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zrp-red hover:underline break-all"
                      >
                        {
                          part.value
                        }
                      </a>
                    );
                  }

                  return (
                    <span
                      key={
                        index
                      }
                    >
                      {
                        part.value
                      }
                    </span>
                  );
                }
              )}
            </p>
          )}

          {/* Location / Website / Joined */}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />

                {profile.location.replace(
                  /^@/,
                  ""
                )}
              </span>
            )}

            {profile.website && (
              <a
                href={
                  profile.website
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-zrp-red hover:underline"
              >
                <LinkIcon className="w-4 h-4" />

                {profile.website.replace(
                  /^https?:\/\//,
                  ""
                )}
              </a>
            )}

            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />

              {t(
                "profile.joined"
              )}{" "}
              {
                formattedJoinDate
              }
            </span>
          </div>

          {/* Plan */}

          {profile.plan && (
            <div className="mt-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPlanBadgeColor(
                  profile.plan
                )}`}
              >
                {planLabelMap[
                  profile.plan.toLowerCase()
                ] ||
                  profile.plan}
              </span>
            </div>
          )}

          {/* Following / Followers */}

          <div className="flex gap-4 mt-2">
            {showFollowingCount ? (
              <Link
                href={`/profile/${profile.username}/following`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
              >
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatProfileCount(
                    profile._count
                      .following
                  )}
                </span>{" "}
                {t(
                  "profile.following"
                )}
              </Link>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">
                  -
                </span>{" "}
                {t(
                  "profile.following"
                )}
              </span>
            )}

            <Link
              href={`/profile/${profile.username}/followers`}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
            >
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatProfileCount(
                  profile._count
                    .followers
                )}
              </span>{" "}
              {t(
                "profile.followers"
              )}
            </Link>
          </div>

          {/* ───────────────────────────────────────────────────────
              CHARITY / IMPACT
          ─────────────────────────────────────────────────────── */}

          {/* One metadata line, where there used to be a red Impact
              pill here and a blue gradient Trust Passport card below the
              milestones - two saturated surfaces for two facts, inside
              150px that already carried the banner. Both facts and both
              destinations survive; only the surfaces are gone. The
              trailing emoji goes too: the heart glyph already says it,
              twice was decoration. text-gray-400 on white is 2.85:1 and
              failed AA, so the line sits at the gray-500 floor. */}
          {/* charityContributionUsdc is a real figure - the sum of this
              account's own completed tips' charityAmount (src/lib/charity.ts).
              For an account that has never been tipped it is genuinely
              0, and "Impact: $0.00 contributed to charity" on every such
              profile turns a real distinction into noise. So the
              per-account figure appears only when there is one; the 35%
              line stays, because it is true of the platform regardless
              of this account. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
            {charityContributionUsdc > 0 && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Heart
                  className="w-4 h-4"
                  aria-hidden="true"
                />

                {t(
                  "profile.impact",
                  {
                    amount: charityContributionUsdc.toFixed(2),
                  }
                )}
              </span>
            )}

            <span>
              {t(
                "profile.charityNote",
                {
                  pct: 35,
                }
              )}
            </span>
          </div>

          {/* Trust Passport - a row of its own rather than a word in the
              metadata line, because it is a destination, not a fact. It
              stays quiet (a hairline, the page's own ground) but reads
              unambiguously as something you open: full-width target, a
              real chevron, and the signals it summarises are the
              account's own - verification and how long it has been
              here. Both come from data already on this page; nothing
              here is a new or invented trust level. */}
          <Link
            href={`/trust/${profile.username}`}
            className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"
          >
            <ShieldCheck
              className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400"
              aria-hidden="true"
            />

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                {t("profile.trustPassportTitle")}
              </span>

              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                {trustSummary}
              </span>
            </span>

            <ChevronRight
              className="w-4 h-4 shrink-0 text-gray-400"
              aria-hidden="true"
            />
          </Link>

          {/* ───────────────────────────────────────────────────────
              MILESTONE BADGES
          ─────────────────────────────────────────────────────── */}

          {milestones.length >
            0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {milestones.map(
                (
                  m,
                  i
                ) => (
                  <span
                    key={
                      i
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700"
                    title={
                      milestoneLabel(m, t)
                    }
                  >
                    <span>
                      {
                        m.icon
                      }
                    </span>

                    {
                      milestoneLabel(m, t)
                    }
                  </span>
                )
              )}
            </div>
          )}


          {/* ───────────────────────────────────────────────────────
              ACTIVITY HEATMAP
          ─────────────────────────────────────────────────────── */}

          {canViewPosts && (
            <ActivityHeatmap
              username={
                profile.username
              }
            />
          )}
        </div>
      </div>

      {/* The composer used to render here as well as on Home. It is the
          same component and the same action, and on a profile it sat
          between the identity block and the tabs, pushing Posts /
          Replies / Media below the fold on a phone. Composing belongs to
          the feed; a profile is for reading one. Nothing is lost - the
          composer on Home is the same one, reachable from every screen
          via the bottom nav and the sidebar. */}

      {/* ───────────────────────────────────────────────────────────
          TABS
      ─────────────────────────────────────────────────────────── */}

      {/* Six tabs do not fit a 320px phone, and the row scrolled with
          nothing to say so - Media and Analytics were simply unreachable
          unless you happened to swipe a strip that looked static. The
          fade at the trailing edge is the affordance; scroll-snap makes
          the swipe land on a tab rather than between two. */}
      <div className="relative mt-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent dark:from-zrp-deepBlack lg:hidden"
        />

        <div
          role="tablist"
          aria-label={t("profile.posts")}
          className="flex px-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        >
        {visibleTabs.map(
          (tab) => {
            const TabIcon =
              tab ===
              "analytics"
                ? Eye
                : tabIconMap[
                    tab
                  ];

            return (
              <button
                key={tab}
                onClick={() =>
                  setActiveTab(
                    tab
                  )
                }
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative flex-shrink-0 snap-start min-h-[44px] px-4 py-3 text-sm font-medium transition hover:bg-gray-50 dark:hover:bg-gray-800/50 whitespace-nowrap ${
                  activeTab ===
                  tab
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <TabIcon className="w-4 h-4" />

                  {tab ===
                  "analytics"
                    ? t(
                        "profile.analytics"
                      )
                    : tabLabelMap[
                        tab
                      ]}
                </span>

                {activeTab ===
                  tab && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-zrp-red rounded-full" />
                )}
              </button>
            );
          }
        )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────
          CONTENT
      ─────────────────────────────────────────────────────────── */}

      <div className="mt-4 px-4">
        {loading ? (
          activeTab === "media" ? (
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-gray-100 dark:bg-gray-800 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <SkeletonFeed count={3} />
          )
        ) : !canViewPosts ? (
          renderProtectedMessage()
        ) : activeTab ===
          "analytics" ? (
          <AnalyticsTab
            userId={
              profile.id
            }
          />
        ) : posts.length ===
          0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>
              {
                emptyStateMap[
                  activeTab as Exclude<
                    TabType,
                    "analytics"
                  >
                ]
              }
            </p>
          </div>
        ) : (
          <div>
            {/* ─────────────────────────────────────────────────────
                POSTS
            ───────────────────────────────────────────────────── */}

            {activeTab ===
              "posts" && (
              <>
                {pinnedPost && (
                  <div className="relative border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-medium mb-2">
                      <Pin className="w-3.5 h-3.5" />

                      {t(
                        "profile.pinned"
                      )}
                    </div>

                    <PostCard
                      post={
                        pinnedPost
                      }
                      onUpdate={
                        fetchPosts
                      }
                      showPinOption={
                        isOwnProfile
                      }
                      isPinned={
                        true
                      }
                      onPinToggle={
                        fetchProfile
                      }
                    />
                  </div>
                )}

                {posts.map(
                  (post) => {
                    if (
                      pinnedPost &&
                      post.id ===
                        pinnedPost.id
                    ) {
                      return null;
                    }

                    return (
                      <PostCard
                        key={
                          post.id
                        }
                        post={
                          post
                        }
                        onUpdate={
                          fetchPosts
                        }
                        showPinOption={
                          isOwnProfile
                        }
                        isPinned={
                          false
                        }
                        onPinToggle={
                          fetchProfile
                        }
                      />
                    );
                  }
                )}
              </>
            )}

            {/* ─────────────────────────────────────────────────────
                REPOSTS
            ───────────────────────────────────────────────────── */}

            {activeTab ===
              "reposts" && (
              <>
                {posts.map(
                  (post) => (
                    <PostCard
                      key={
                        post.id
                      }
                      post={
                        post
                      }
                      onUpdate={
                        fetchPosts
                      }
                    />
                  )
                )}
              </>
            )}

            {/* ─────────────────────────────────────────────────────
                REPLIES
            ───────────────────────────────────────────────────── */}

            {activeTab ===
              "replies" && (
              <>
                {posts.map(
                  (
                    reply
                  ) =>
                    renderReplyItem(
                      reply
                    )
                )}
              </>
            )}

            {/* ─────────────────────────────────────────────────────
                LIKES
            ───────────────────────────────────────────────────── */}

            {activeTab ===
              "likes" && (
              <>
                {posts.map(
                  (post) => (
                    <PostCard
                      key={
                        post.id
                      }
                      post={
                        post
                      }
                      onUpdate={
                        fetchPosts
                      }
                    />
                  )
                )}
              </>
            )}

            {/* ─────────────────────────────────────────────────────
                MEDIA
            ───────────────────────────────────────────────────── */}

            {/* A photo grid, not a column of full post cards - this tab
                exists specifically to browse what someone has posted
                visually (every reference profile does this), and a
                column of full-width PostCards made scanning nine
                photos mean nine long scrolls through captions and
                action bars identical to the Posts tab. Each post here
                already has a real imageUrl (the /media endpoint only
                returns posts where one is set), so a plain square
                thumbnail is real content, not a placeholder. */}
            {activeTab === "media" && (
              <div className="grid grid-cols-3 gap-0.5">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="relative block aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden group"
                  >
                    {post.imageUrl && (
                      <img
                        src={post.imageUrl}
                        alt=""
                        className="w-full h-full object-cover transition group-hover:opacity-90"
                      />
                    )}

                    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-white">
                        <Heart className="w-4 h-4" />
                        {formatProfileCount(post._count.likes)}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-white">
                        <MessageSquare className="w-4 h-4" />
                        {formatProfileCount(post._count.comments)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {nextCursor && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMorePosts}
                  disabled={loadingMore}
                  className="text-sm text-zrp-red hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? t("feed.loadingMore") : t("feed.loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────
          TIP MODAL
      ─────────────────────────────────────────────────────────── */}

      {showTipModal &&
        profile && (
          <TipModal
            isOpen={
              showTipModal
            }
            onClose={() =>
              setShowTipModal(
                false
              )
            }
            recipientId={
              profile.id
            }
            recipientName={
              profile.name ||
              profile.username
            }
            recipientWallet={
              profile.solanaWallet
            }
            onTipSent={() => {
              fetchProfile();
            }}
          />
        )}

      {showTipNativeNotice && (
        <NativePaymentNotice
          messageKey="native.paymentUnavailable.tipsMessage"
          onClose={() => setShowTipNativeNotice(false)}
        />
      )}
    </div>
  );
}
