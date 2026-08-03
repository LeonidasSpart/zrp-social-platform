"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  MapPin, Link as LinkIcon, Calendar, Users, Pencil, Pin, PinOff,
  Heart, Camera, Loader2, MessageCircle, UserPlus, UserCheck, Share2,
  Eye, Bell, BellOff // ← added Bell and BellOff for mute
} from "lucide-react";
import PostCard from "@/components/PostCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import AnalyticsTab from "@/components/AnalyticsTab";

function formatProfileCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
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
  _count: {
    posts: number;
    followers: number;
    following: number;
  };
  pinnedPostId: string | null;
  isFollowing: boolean;
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
  _count?: {
    likes: number;
    comments: number;
    reposts: number;
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
}

type TabType = "posts" | "replies" | "media" | "likes" | "analytics";

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("posts");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  // ─── MUTE STATE ──────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = session?.user?.id === profile?.id;

  // ─── Fetch profile & follow & mute status ──────────────────────────
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
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
        setProfile((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            _count: {
              ...prev._count,
              followers: data.following ? prev._count.followers + 1 : prev._count.followers - 1,
            },
          };
        });
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
        alert("Profile link copied to clipboard!");
      } catch {
        alert("Share not supported on this device.");
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
        alert("Failed to upload banner");
      }
    } catch (error) {
      console.error("Banner upload error:", error);
      alert("Failed to upload banner");
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
        alert("Failed to upload avatar");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      alert("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-12 text-gray-500">User not found</div>;
  }

  const joinDate = new Date(profile.createdAt);
  const formattedJoinDate = joinDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const impactMeals = Math.floor(Math.random() * 50) + 5;

  // ─── Render reply item ──────────────────────────────────────────────
  const renderReplyItem = (reply: any) => {
    const isOwn = reply.author.id === session?.user?.id;

    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
        <div className="flex items-start gap-3">
          <Link href={`/profile/${reply.author.username}`} className="flex-shrink-0">
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
                className="font-semibold hover:underline text-gray-900 dark:text-white"
              >
                {reply.author.name || reply.author.username}
              </Link>
              <span className="text-sm text-gray-500">@{reply.author.username}</span>
              <span className="text-sm text-gray-400">·</span>
              <span className="text-sm text-gray-400">
                {new Date(reply.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* ─── Replying to ────────────────────────────────────────── */}
            {reply.replyTo && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Replying to <Link href={`/profile/${reply.replyTo.author.username}`} className="text-blue-600 hover:underline">
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
      </div>
    );
  };

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
              title="Change banner"
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
                  title="Change avatar"
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
            <button
              onClick={handleShareProfile}
              className="flex items-center gap-1 px-3 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share Profile</span>
            </button>

            {isOwnProfile ? (
              <Link
                href="/settings"
                className="flex items-center gap-1 px-3 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Edit Profile</span>
              </Link>
            ) : (
              <>
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    isFollowing
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                  }`}
                >
                  {followLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </>
                  )}
                </button>
                <Link
                  href={`/messages/${profile.username}`}
                  className="flex items-center gap-1 px-3 sm:px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-xs sm:text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Message</span>
                </Link>

                {/* ─── MUTE BUTTON ──────────────────────────────────── */}
                <button
                  onClick={handleMute}
                  disabled={muteLoading}
                  className={`flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap border ${
                    isMuted
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600"
                      : "bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title={isMuted ? "Unmute user" : "Mute user"}
                >
                  {muteLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isMuted ? (
                    <>
                      <BellOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Unmute</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      <span className="hidden sm:inline">Mute</span>
                    </>
                  )}
                </button>
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
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>

          {profile.bio && (
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {profile.bio}
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
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <LinkIcon className="w-4 h-4" />
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Joined {formattedJoinDate}
            </span>
          </div>

          <div className="flex gap-4 mt-2">
            <Link
              href={`/profile/${profile.username}/following`}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
            >
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatProfileCount(profile._count.following)}
              </span>{" "}
              Following
            </Link>
            <Link
              href={`/profile/${profile.username}/followers`}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline whitespace-nowrap"
            >
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatProfileCount(profile._count.followers)}
              </span>{" "}
              Followers
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-zrp-red/10 text-zrp-red px-3 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
              <Heart className="w-3.5 h-3.5" />
              Impact: {impactMeals} meals 🧡
            </span>
            <span className="text-gray-400 text-xs">
              35% of profits go to charity
            </span>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex mt-4 px-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {(["posts", "replies", "media", "likes", "analytics"] as const).map((tab) => {
          if (tab === "analytics" && !isOwnProfile) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 py-3 text-sm font-medium transition hover:bg-gray-50 dark:hover:bg-gray-800/50 whitespace-nowrap ${
                activeTab === tab
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {tab === "analytics" ? (
                <span className="flex items-center justify-center gap-1">
                  <Eye className="w-4 h-4" />
                  Analytics
                </span>
              ) : (
                tab.charAt(0).toUpperCase() + tab.slice(1)
              )}
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
        ) : activeTab === "analytics" ? (
          <AnalyticsTab userId={profile.id} />
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No {activeTab} yet.</p>
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
                      Pinned
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

            {/* ─── Replies Tab ────────────────────────────────────────── */}
            {activeTab === "replies" && (
              <>
                {posts.map((reply) => renderReplyItem(reply))}
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

            {/* ─── Likes Tab ──────────────────────────────────────────── */}
            {activeTab === "likes" && (
              <>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
