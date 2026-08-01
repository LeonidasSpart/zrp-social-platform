"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pin, PinOff, MapPin, Link as LinkIcon, Calendar, Users, MessageSquare } from "lucide-react";
import PostCard from "@/components/PostCard";
import VerifiedBadge from "@/components/VerifiedBadge";

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
  const [activeTab, setActiveTab] = useState<"posts" | "followers" | "following">("posts");

  const isOwnProfile = session?.user?.username === params.username;

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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {/* ─── Cover Image ─── */}
      <div className="relative h-48 bg-gradient-to-r from-zrp-red/20 to-zrp-red/5 rounded-t-lg overflow-hidden">
        {profile.coverUrl && (
          <img
            src={profile.coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* ─── Avatar ─── */}
      <div className="flex items-end -mt-12 px-4">
        <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-white dark:border-gray-900 overflow-hidden">
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
        <div className="ml-auto flex gap-2 pb-2">
          {isOwnProfile && (
            <Link
              href="/settings"
              className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      {/* ─── Profile Info ─── */}
      <div className="px-4 mt-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {profile.name || profile.username}
          </h1>
          {profile.badgeType && <VerifiedBadge badgeType={profile.badgeType} />}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>

        {profile.bio && (
          <p className="mt-2 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
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
            Joined {formatDate(profile.createdAt)}
          </span>
        </div>

        <div className="flex gap-4 mt-3">
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
        <button
          onClick={() => setActiveTab("posts")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "posts"
              ? "text-zrp-red border-b-2 border-zrp-red"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Posts
        </button>
        <button
          onClick={() => setActiveTab("followers")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "followers"
              ? "text-zrp-red border-b-2 border-zrp-red"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Followers
        </button>
        <button
          onClick={() => setActiveTab("following")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "following"
              ? "text-zrp-red border-b-2 border-zrp-red"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Following
        </button>
      </div>

      {/* ─── Content ─── */}
      <div className="mt-4">
        {activeTab === "posts" && (
          <div className="space-y-4">
            {/* Pinned Post */}
            {pinnedPost && (
              <div className="relative border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-medium mb-2">
                  <Pin className="w-3.5 h-3.5" />
                  Pinned Post
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
                // Skip if this post is pinned (already shown above)
                if (pinnedPost && post.id === pinnedPost.id) return null;
                return (
                  <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
                );
              })
            )}
          </div>
        )}

        {activeTab === "followers" && (
          <div className="text-center py-8 text-gray-500">Followers list coming soon</div>
        )}

        {activeTab === "following" && (
          <div className="text-center py-8 text-gray-500">Following list coming soon</div>
        )}
      </div>
    </div>
  );
}
