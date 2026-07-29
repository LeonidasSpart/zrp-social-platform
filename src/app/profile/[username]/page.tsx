"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import PostCard from "@/components/PostCard";

interface User {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  _count: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing: boolean;
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
  };
  _count: {
    likes: number;
    comments: number;
    reposts: number;
  };
  liked?: boolean;
}

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) throw new Error("User not found");
      const data = await res.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    }
  };

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${params.username}/posts`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── UPDATED: Uses username instead of id ──────────────────────
  const handleFollow = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/users/${user.username}/follow`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          ...user,
          isFollowing: data.following,
          _count: {
            ...user._count,
            followers: data.following ? user._count.followers + 1 : user._count.followers - 1,
          },
        });
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">{error || "User not found"}</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm mt-2 block">
            ← Back to home
          </Link>
        </div>
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
      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-3xl font-bold flex-shrink-0">
            {user.name?.[0] || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-500">@{user.username}</p>
            {user.bio && <p className="text-gray-700 mt-2">{user.bio}</p>}
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span>Joined {formatDate(user.createdAt)}</span>
            </div>
          </div>
          <div>
            {isOwnProfile ? (
              <Link
                href="/settings"
                className="px-4 py-1.5 border border-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 transition inline-block"
              >
                Edit Profile
              </Link>
            ) : (
              <button
                onClick={handleFollow}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  user.isFollowing
                    ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {user.isFollowing ? "Unfollow" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100">
          <div>
            <span className="font-bold text-gray-900">{user._count.posts}</span>
            <span className="text-gray-500 text-sm ml-1">Posts</span>
          </div>
          <div>
            <span className="font-bold text-gray-900">{user._count.followers}</span>
            <span className="text-gray-500 text-sm ml-1">Followers</span>
          </div>
          <div>
            <span className="font-bold text-gray-900">{user._count.following}</span>
            <span className="text-gray-500 text-sm ml-1">Following</span>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="mt-4 space-y-4">
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 text-center py-12">
            <p className="text-gray-500">
              {isOwnProfile
                ? "You haven't posted anything yet."
                : `@${user.username} hasn't posted anything yet.`}
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
          ))
        )}
      </div>
    </div>
  );
}
