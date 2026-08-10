"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  MapPin, Link as LinkIcon, Calendar, Users, Pencil, Pin, PinOff,
  Heart, Camera, Loader2, MessageCircle, UserPlus, UserCheck, Share2,
  Eye, Bell, BellOff, Ban, CheckCircle, MoreHorizontal, DollarSign, Lock,
  FileText, Repeat, MessageSquare, Image as ImageIcon, Award, Sparkles
} from "lucide-react";
import PostCard from "@/components/PostCard";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import VerifiedBadge from "@/components/VerifiedBadge";
import AnalyticsTab from "@/components/AnalyticsTab";
import PostComposer from "@/components/PostComposer";
import TipModal from "@/components/TipModal";
import { useLanguage } from "@/contexts/LanguageContext";

function formatProfileCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

// ─── Parse bio for @mentions and #hashtags ──────────────────────────
function parseBio(bio: string) {
  const parts: { type: "text" | "mention" | "hashtag"; value: string }[] = [];
  let lastIndex = 0;
  const regex = /(@\w+)|(#\w+)/g;
  let match;
  while ((match = regex.exec(bio)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: bio.slice(lastIndex, match.index) });
    }
    parts.push({
      type: match[0].startsWith("@") ? "mention" : "hashtag",
      value: match[0],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < bio.length) {
    parts.push({ type: "text", value: bio.slice(lastIndex) });
  }
  return parts;
}

// ─── Compute milestone badges from data we already have ─────────────
// No new API needed — purely derived from profile.createdAt and counts.
interface Milestone {
  icon: string;
  label: string;
}

function getMilestones(profile: UserProfile): Milestone[] {
  const badges: Milestone[] = [];

  const joined = new Date(profile.createdAt);
  const monthsSinceJoin =
    (Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (monthsSinceJoin >= 12) {
    badges.push({ icon: "🎂", label: `${Math.floor(monthsSinceJoin / 12)}yr on ZRP` });
  } else if (monthsSinceJoin >= 6) {
    badges.push({ icon: "🎉", label: "6 months on ZRP" });
  } else if (monthsSinceJoin >= 1) {
    badges.push({ icon: "🌱", label: "New member" });
  }

  const posts = profile._count.posts;
  if (posts >= 500) badges.push({ icon: "🏆", label: "500+ posts" });
  else if (posts >= 100) badges.push({ icon: "📝", label: "100+ posts" });
  else if (posts >= 10) badges.push({ icon: "✍️", label: "10+ posts" });

  const followers = profile._count.followers;
  if (followers >= 1000) badges.push({ icon: "⭐", label: "1K+ followers" });
  else if (followers >= 100) badges.push({ icon: "👥", label: "100+ followers" });

  return badges;
}

interface UserProfile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  location: string | null;
  website: string | null;
  badgeType: string | null;
  createdAt: string;
  isAdmin: boolean;
  plan: string | null;
  publicLikes: boolean;
  publicFollowing: boolean;
  isPrivate: boolean; // ✅ added
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
  followRequestStatus?: "pending" | "none"; // ✅ added
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
  postId?: string; // for replies
}

type TabType = "posts" | "replies" | "media" | "likes" | "reposts" | "analytics";

// ─── Icon per tab ─────────────────────────────────────────────────
const tabIconMap: Record<Exclude<TabType, "analytics">, React.ElementType> = {
  posts: FileText,
  reposts: Repeat,
  replies: MessageSquare,
  likes: Heart,
  media: ImageIcon,
};

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("posts");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followRequestStatus, setFollowRequestStatus] = useState<"none" | "pending">("none");

  // ─── MUTE STATE ──────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);

  // ─── BLOCK STATE ──────────────────────────────────────────────────────
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  // ─── MORE DROPDOWN ──────────────────────────────────────────────────
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // ─── TIP MODAL STATE ──────────────────────────────────────────────
  const [showTipModal, setShowTipModal] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = session?.user?.id === profile?.id;

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  // ─── Click outside to close dropdown ──────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Fetch profile & follow & mute & block status ──────────────────
  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}`);
      if (!res.ok) {
        setProfile(null);
        return;
      }
      const data = await res.json();
      setProfile(data);
      setIsFollowing(data.isFollowing || false);
      setIsBlocked(data.isBlocked || false);
      setFollowRequestStatus(data.followRequestStatus || "none");
      if (data.pinnedPostId) {
        fetchPinnedPost(data.pinnedPostId);
      } else {
        setPinnedPost(null);
      }
      // ─── Fetch mute status ──────────────────────────────────────────
      if (session?.user?.id && data.id !== session.user.id) {
        const muteRes = await fetch(`/api/users/mute?userId=${data.id}`);
        if (muteRes.ok) {
          const muteData = await muteRes.json();
          setIsMuted(muteData.muted);
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    }
  };

  const fetchPinnedPost = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`);
      if (res.ok) {
        const data = await res.json();
        setPinnedPost(data);
      }
    } catch (error) {
      console.error("Error fetching pinned post:", error);
    }
  };

  // ─── Fetch posts based on active tab ──────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = `/api/users/${params.username}/posts`;
      if (activeTab === "replies") {
        endpoint = `/api/users/${params.username}/replies`;
      } else if (activeTab === "media") {
        endpoint = `/api/users/${params.username}/media`;
      } else if (activeTab === "likes") {
        endpoint = `/api/users/${params.username}/likes`;
      } else if (activeTab === "reposts") {
        endpoint = `/api/users/${params.username}/reposts`;
      }
      const res = await fetch(endpoint);
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [params.username, activeTab]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    }
  }, [params.username, status]);

  useEffect(() => {
    if (status === "authenticated" && profile) {
      fetchPosts();
    }
  }, [activeTab, profile, status, fetchPosts]);

  // ─── Follow / Unfollow ──────────────────────────────────────────────
  const handleFollow = async () => {
    if (!session || isOwnProfile) return;
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/users/${params.username}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isFollowing ? "unfollow" : "follow" }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.requested) {
          // Follow request sent
          setFollowRequestStatus("pending");
          setProfile((prev) => prev ? { ...prev, followRequestStatus: "pending" } : null);
        } else {
          setIsFollowing(data.following);
          setFollowRequestStatus("none");
          setProfile((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              _count: {
                ...prev._count,
                followers: data.following ? prev._count.followers + 1 : prev._count.followers - 1,
              },
              isFollowing: data.following,
            };
          });
        }
      }
    } catch (error) {
      console.error("Follow error:", error);
    } finally {
      setFollowLoading(false);
    }
  };

  // ─── Mute / Unmute ──────────────────────────────────────────────────
  const handleMute = async () => {
    if (!session || isOwnProfile || !profile) return;
    setMuteLoading(true);
    try {
      const res = await fetch("/api/users/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsMuted(data.muted);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to toggle mute");
      }
    } catch (error) {
      console.error("Mute error:", error);
      alert("Failed to toggle mute");
    } finally {
      setMuteLoading(false);
    }
  };

  // ─── Block / Unblock ──────────────────────────────────────────────────
  const handleBlock = async () => {
    if (!session || isOwnProfile || !profile) return;
    setBlockLoading(true);
    try {
      const method = isBlocked ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${profile.username}/block`, {
        method: method,
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setIsBlocked(data.blocked);
        fetchProfile();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to toggle block");
      }
    } catch (error) {
      console.error("Block error:", error);
      alert("Failed to toggle block");
    } finally {
      setBlockLoading(false);
    }
  };

  // ─── Share Profile ──────────────────────────────────────────────────
  const handleShareProfile = async () => {
    const url = `${window.location.origin}/profile/${profile?.username}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.name || profile?.username} on ZRP Social`,
          text: `Check out ${profile?.name || profile?.username}'s profile on ZRP Social!`,
          url,
        });
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert(t("profile.linkCopied"));
      } catch {
        alert(t("profile.shareNotSupported"));
      }
    }
  };

  // ─── Banner upload ──────────────────────────────────────────────────
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "cover");

    try {
      const res = await fetch("/api/user/update-cover", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((prev) => prev ? { ...prev, coverUrl: data.coverUrl } : null);
      } else {
        alert(t("profile.uploadBannerFailed"));
      }
    } catch (error) {
      console.error("Banner upload error:", error);
      alert(t("profile.uploadBannerFailed"));
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  };

  // ─── Avatar upload ──────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "avatar");

    try {
      const res = await fetch("/api/user/update-avatar", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((prev) => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
      } else {
        alert(t("profile.uploadAvatarFailed"));
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      alert(t("profile.uploadAvatarFailed"));
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("action.loading")}</div>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-12 text-gray-500">{t("profile.userNotFound")}</div>;
  }

  const joinDate = new Date(profile.createdAt);
  const formattedJoinDate = joinDate.toLocaleDateString(localeMap[language] || "en-US", {
    month: "long",
    year: "numeric",
  });

  const impactMeals = Math.floor(Math.random() * 50) + 5;
  const milestones = getMilestones(profile);

  // ─── Plan badge color ───────────────────────────────────────────────
  const getPlanBadgeColor = (plan: string | null) => {
    if (!plan) return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    switch (plan.toLowerCase()) {
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

  const planLabelMap: Record<string, string> = {
    free: t("adminUsers.planFree"),
    pro: t("adminUsers.planPro"),
    business: t("adminUsers.planBusiness"),
    enterprise: t("adminUsers.planEnterprise"),
  };

  const tabLabelMap: Record<Exclude<TabType, "analytics">, string> = {
    posts: t("profile.posts"),
    reposts: t("profile.reposts"),
    replies: t("profile.replies"),
    likes: t("profile.likes"),
    media: t("profile.media"),
  };

  const emptyStateMap: Record<Exclude<TabType, "analytics">, string> = {
    posts: t("profile.noPosts"),
    reposts: t("profile.noReposts"),
    replies: t("profile.noReplies"),
    likes: t("profile.noLikes"),
    media: t("profile.noMedia"),
  };

  // ─── Render reply item ──────────────────────────────────────────────
  const renderReplyItem = (reply: any) => {
    const postLink = reply.postId ? `/post/${reply.postId}#comment-${reply.id}` : '#';

    return (
      <Link
        href={postLink}
        className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
      >
        <div className="flex items-start gap-3">
          <Link
            href={`/profile/${reply.author.username}`}
            className="flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              {reply.author.avatarUrl ? (
                <img
                  src={reply.author.avatarUrl}
                  alt={reply.author.name || reply.author.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                  {(reply.author.name || reply.author.username)[0].toUpperCase()}
                </div>
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${reply.author.username}`}
                className="font-semibold hover:underline text-gray-900 dark:text-white inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {reply.author.name || reply.author.username}
                <VerifiedBadge badgeType={reply.author.badgeType} />
              </Link>
              <span className="text-sm text-gray-500">@{reply.author.username}</span>
              <span className="text-sm text-gray-400">·</span>
              <span className="text-sm text-gray-400">
                {new Date(reply.createdAt).toLocaleDateString(localeMap[language] || "en-US")}
              </span>
            </div>

            {/* ─── Replying to ────────────────────────────────────────── */}
            {reply.replyTo && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("profile.replyingTo")}{" "}
                <Link
                  href={`/profile/${reply.replyTo.author.username}`}
                  className="text-zrp-red hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{reply.replyTo.author.username}
                </Link>
              </div>
            )}

            <p className="mt-1 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {reply.content}
            </p>

            {reply.imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img
                  src={reply.imageUrl}
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

  // ─── Determine which tabs to show based on privacy ──────────────
  const showLikesTab = isOwnProfile || profile.publicLikes !== false;
  const showFollowingCount = isOwnProfile || profile.publicFollowing !== false;

  // ─── Available tabs in the NEW order: Posts → Reposts → Replies → Likes → Media → Analytics ──
  const allTabs: TabType[] = ["posts", "reposts", "replies", "likes", "media", "analytics"];
  const visibleTabs = allTabs.filter((tab) => {
    if (tab === "analytics" && !isOwnProfile) return false;
    if (tab === "likes" && !showLikesTab) return false;
    return true;
  });

  // ─── Check if we should show the tip button ──────────────────────
  const canReceiveTips = !isOwnProfile && profile.creatorProfile?.tipsEnabled === true;

  // ─── Check if we can view posts ──────────────────────────────────
  const canViewPosts = isOwnProfile || !profile.isPrivate || (isFollowing && !followRequestStatus);

  // ─── Protected account message ──────────────────────────────────
  const renderProtectedMessage = () => (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6 mb-4">
        <Lock className="w-12 h-12 text-gray-500 dark:text-gray-400" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
        {t("profile.protectedAccount")}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
        {t("profile.protectedMessage")}
      </p>
    </div>
  );

  // ─── Determine if follow button should show "Requested" ─────────
  const isFollowRequested = followRequestStatus === "pending";

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-zrp-deepBlack min-h-screen">
      {/* ─── Banner ─── */}
      <div className="relative h-48 bg-gradient-to-r from-zrp-red/30 to-zrp-red/10">
        {profile.coverUrl && (
          <img
            src={profile.coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />

        {isOwnProfile && (
          <div className="absolute bottom-2 right-2">
            <button
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition"
              title={t("profile.changeBanner")}
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
              onChange={handleBannerUpload}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* ─── Profile info ─── */}
      <div className="px-4 relative z-10">
        {/* Avatar + action buttons row — never contains the name/bio text */}
        <div className="flex items-start justify-between gap-3">
          <div className="relative w-20 h-20 -mt-10 sm:w-28 sm:h-28 sm:-mt-16 rounded-full border-4 border-white dark:border-gray-900 shadow-lg overflow-hidden flex-shrink-0 group bg-white dark:bg-zrp-deepBlack">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name || profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700">
                {(profile.name || profile.username)[0].toUpperCase()}
              </div>
            )}
            {isOwnProfile && (
              <>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                  title={t("profile.changeAvatar")}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2 flex-shrink-0">
            {/* ─── Share Profile ──────────────────────────────────────── */}
            <button
              onClick={handleShareProfile}
              className="flex items-center gap-1 px-2 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("profile.share")}</span>
            </button>

            {isOwnProfile ? (
              <Link
                href="/settings"
                className="flex items-center gap-1 px-2 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">{t("profile.edit")}</span>
              </Link>
            ) : (
              <>
                {/* ─── Follow / Following / Requested ────────────────── */}
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
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
                    "Requested"
                  ) : isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span className="hidden sm:inline">{t("action.following")}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>{t("action.follow")}</span>
                    </>
                  )}
                </button>

                {/* ─── Message ────────────────────────────────────────── */}
                <Link
                  href={`/messages/${profile.username}`}
                  className="flex items-center gap-1 px-2 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("action.message")}</span>
                </Link>

                {/* ─── Tip Button ─────────────────────────────────────── */}
                {canReceiveTips && (
                  <button
                    onClick={() => setShowTipModal(true)}
                    className="flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("profile.tip")}</span>
                  </button>
                )}

                {/* ─── More dropdown ──────────────────────────────────── */}
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    className="flex items-center gap-1 px-2 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
                    title={t("profile.moreActions")}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {moreMenuOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                      {/* Mute / Unmute */}
                      <button
                        onClick={() => {
                          handleMute();
                          setMoreMenuOpen(false);
                        }}
                        disabled={muteLoading}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        {muteLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isMuted ? (
                          <>
                            <BellOff className="w-4 h-4" />
                            {t("profile.unmute")}
                          </>
                        ) : (
                          <>
                            <Bell className="w-4 h-4" />
                            {t("profile.mute")}
                          </>
                        )}
                      </button>
                      {/* Block / Unblock */}
                      <button
                        onClick={() => {
                          handleBlock();
                          setMoreMenuOpen(false);
                        }}
                        disabled={blockLoading}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition border-t border-gray-200 dark:border-gray-700"
                      >
                        {blockLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isBlocked ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            {t("profile.unblock")}
                          </>
                        ) : (
                          <>
                            <Ban className="w-4 h-4" />
                            {t("profile.block")}
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

        {/* Name/bio block — always full width, never squeezed by the row above */}
        <div className="mt-3 w-full">
          <div className="flex items-center gap-1 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white break-words">
              {profile.name || profile.username}
            </h1>
            {profile.badgeType && <VerifiedBadge badgeType={profile.badgeType} />}
            {profile.isPrivate && !isOwnProfile && (
              <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-1" />
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>

          {/* ─── Bio with parsed mentions and hashtags ───────────────── */}
          {profile.bio && (
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {parseBio(profile.bio).map((part, index) => {
                if (part.type === "mention") {
                  const username = part.value.slice(1);
                  return (
                    <Link
                      key={index}
                      href={`/profile/${username}`}
                      className="text-zrp-red hover:underline"
                    >
                      {part.value}
                    </Link>
                  );
                }
                if (part.type === "hashtag") {
                  const tag = part.value.slice(1);
                  return (
                    <Link
                      key={index}
                      href={`/hashtag/${tag}`}
                      className="text-zrp-red hover:underline"
                    >
                      {part.value}
                    </Link>
                  );
                }
                return <span key={index}>{part.value}</span>;
              })}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {profile.location.replace(/^@/, "")}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-zrp-red hover:underline"
              >
                <LinkIcon className="w-4 h-4" />
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {t("profile.joined")} {formattedJoinDate}
            </span>
          </div>

          {/* ─── PLAN BADGE ───────────────────────────────────────────── */}
          {profile.plan && (
            <div className="mt-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPlanBadgeColor(profile.plan)}`}>
                {planLabelMap[profile.plan.toLowerCase()] || profile.plan}
              </span>
            </div>
          )}

          <div className="flex gap-4 mt-2">
            {showFollowingCount ? (
              <Link
                href={`/profile/${profile.username}/following`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
              >
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatProfileCount(profile._count.following)}
                </span>{" "}
                {t("profile.following")}
              </Link>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">—</span> {t("profile.following")}
              </span>
            )}
            <Link
              href={`/profile/${profile.username}/followers`}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
            >
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatProfileCount(profile._count.followers)}
              </span>{" "}
              {t("profile.followers")}
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-zrp-red/10 text-zrp-red px-3 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
              <Heart className="w-3.5 h-3.5" />
              {t("profile.impact", { n: impactMeals })} 🧡
            </span>
            <span className="text-gray-400 text-xs">
              {t("profile.charityNote", { pct: 35 })}
            </span>
          </div>

          {/* ─── Milestone badges ──────────────────────────────────────── */}
          {milestones.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {milestones.map((m, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700"
                  title={m.label}
                >
                  <span>{m.icon}</span>
                  {m.label}
                </span>
              ))}
            </div>
          )}

          {/* ─── Activity heatmap ────────────────────────────────────── */}
          {canViewPosts && <ActivityHeatmap username={profile.username} />}
        </div>
      </div>

      {/* ─── Post Composer (only on own profile) ────────────────────── */}
      {isOwnProfile && (
        <div className="mt-4 px-4">
          <PostComposer onPostCreated={fetchPosts} />
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex mt-4 px-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const TabIcon = tab === "analytics" ? Eye : tabIconMap[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition hover:bg-gray-50 dark:hover:bg-gray-800/50 whitespace-nowrap ${
                activeTab === tab
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <TabIcon className="w-4 h-4" />
                {tab === "analytics" ? t("profile.analytics") : tabLabelMap[tab]}
              </span>
              {activeTab === tab && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-zrp-red rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Content ─── */}
      <div className="mt-4 px-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
          </div>
        ) : !canViewPosts ? (
          // Protected account – hide posts
          renderProtectedMessage()
        ) : activeTab === "analytics" ? (
          <AnalyticsTab userId={profile.id} />
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>{emptyStateMap[activeTab as Exclude<TabType, "analytics">]}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ─── Posts Tab ──────────────────────────────────────────── */}
            {activeTab === "posts" && (
              <>
                {pinnedPost && (
                  <div className="relative border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-medium mb-2">
                      <Pin className="w-3.5 h-3.5" />
                      {t("profile.pinned")}
                    </div>
                    <PostCard
                      post={pinnedPost}
                      onUpdate={fetchPosts}
                      showPinOption={isOwnProfile}
                      isPinned={true}
                      onPinToggle={fetchProfile}
                    />
                  </div>
                )}
                {posts.map((post) => {
                  if (pinnedPost && post.id === pinnedPost.id) return null;
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      onUpdate={fetchPosts}
                      showPinOption={isOwnProfile}
                      isPinned={false}
                      onPinToggle={fetchProfile}
                    />
                  );
                })}
              </>
            )}

            {/* ─── Reposts Tab ────────────────────────────────────────── */}
            {activeTab === "reposts" && (
              <>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
                ))}
              </>
            )}

            {/* ─── Replies Tab ────────────────────────────────────────── */}
            {activeTab === "replies" && (
              <>
                {posts.map((reply) => renderReplyItem(reply))}
              </>
            )}

            {/* ─── Likes Tab ──────────────────────────────────────────── */}
            {activeTab === "likes" && (
              <>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
                ))}
              </>
            )}

            {/* ─── Media Tab ──────────────────────────────────────────── */}
            {activeTab === "media" && (
              <>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Tip Modal ────────────────────────────────────────────────── */}
      {showTipModal && profile && (
        <TipModal
          isOpen={showTipModal}
          onClose={() => setShowTipModal(false)}
          recipientId={profile.id}
          recipientName={profile.name || profile.username}
          onTipSent={() => {
            fetchProfile();
          }}
        />
      )}
    </div>
  );
}
