"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Link as LinkIcon, Calendar, Users, Pencil, Pin, PinOff, CheckCircle } from "lucide-react";
import PostCard from "@/components/PostCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import { format } from "date-fns";

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
}

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
  _count?: {
    likes: number;
    comments: number;
    reposts: number;
  };
  liked?: boolean;
}

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"posts" | "replies" | "media" | "likes">("posts");

  const isOwnProfile = session?.user?.id === profile?.id;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
      fetchPosts();
    }
  }, [params.username, status]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}`);
      const data = await res.json();
      setProfile(data);
      if (data.pinnedPostId) {
        fetchPinnedPost(data.pinnedPostId);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
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

  const fetchPosts = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}/posts`);
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePinToggle = () => {
    // Refresh profile and posts after pin toggle
    fetchProfile();
    fetchPosts();
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const joinDate = new Date(profile.createdAt);
  const formattedJoinDate = joinDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 min-h-screen">
      {/* ─── Cover ─── */}
      <div className="relative h-48 bg-gradient-to-r from-zrp-red/30 to-zrp-red/10">
        {profile.coverUrl && (
          <img
            src={profile.coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        {/* Gradient overlay to ensure text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      </div>

      {/* ─── Avatar & Actions ─── */}
      <div className="relative px-4 -mt-16 flex items-end justify-between">
        <div className="flex items-end gap-4">
          <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-white dark:border-gray-900 overflow-hidden flex-shrink-0 shadow-lg">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name || profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-600 dark:text-gray-300">
                {(profile.name || profile.username)[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="pb-2">
            <div className="flex items-center gap-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {profile.name || profile.username}
              </h1>
              {profile.badgeType && <VerifiedBadge badgeType={profile.badgeType} />}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
          </div>
        </div>

        <div className="pb-2 flex gap-2">
          {isOwnProfile ? (
            <Link
              href="/settings"
              className="flex items-center gap-1 px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <Pencil className="w-4 h-4" />
              Edit Profile
            </Link>
          ) : (
            <button className="px-4 py-1.5 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition">
              Follow
            </button>
          )}
        </div>
      </div>

      {/* ─── Bio ─── */}
      <div className="px-4 mt-2 space-y-1">
        {profile.bio && (
          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {profile.location}
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
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            <span className="font-semibold text-gray-900 dark:text-white">
              {profile._count.following}
            </span>{" "}
            Following
          </Link>
          <Link
            href={`/profile/${profile.username}/followers`}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
          >
            <span className="font-semibold text-gray-900 dark:text-white">
              {profile._count.followers}
            </span>{" "}
            Followers
          </Link>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mt-4">
        {(["posts", "replies", "media", "likes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === tab
                ? "text-zrp-red border-b-2 border-zrp-red"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ─── Content ─── */}
      <div className="mt-4 px-4">
        {activeTab === "posts" && (
          <div className="space-y-4">
            {/* Pinned Post */}
            {pinnedPost && (
              <div className="relative border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10 rounded-xl p-3">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-medium mb-2">
                  <Pin className="w-3.5 h-3.5" />
                  Pinned
                  {isOwnProfile && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/posts/${pinnedPost.id}/pin`, {
                          method: "POST",
                        });
                        if (res.ok) {
                          setPinnedPost(null);
                          fetchProfile();
                        }
                      }}
                      className="ml-auto text-gray-400 hover:text-red-500 transition"
                      title="Unpin"
                    >
                      <PinOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <PostCard post={pinnedPost} onUpdate={fetchPosts} />
              </div>
            )}

            {/* Regular Posts */}
            {posts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No posts yet.</p>
              </div>
            ) : (
              posts.map((post) => {
                if (pinnedPost && post.id === pinnedPost.id) return null;
                return <PostCard key={post.id} post={post} onUpdate={fetchPosts} />;
              })
            )}
          </div>
        )}

        {activeTab === "replies" && (
          <div className="text-center py-8 text-gray-500">Replies coming soon</div>
        )}
        {activeTab === "media" && (
          <div className="text-center py-8 text-gray-500">Media coming soon</div>
        )}
        {activeTab === "likes" && (
          <div className="text-center py-8 text-gray-500">Likes coming soon</div>
        )}
      </div>
    </div>
  );
}
