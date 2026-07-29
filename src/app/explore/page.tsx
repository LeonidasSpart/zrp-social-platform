"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PostCard from "@/components/PostCard";
import { Compass, TrendingUp, Flame } from "lucide-react";

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

export default function ExplorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchExplorePosts();
    }
  }, [status]);

  const fetchExplorePosts = async () => {
    try {
      const res = await fetch("/api/posts/explore");
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error("Error fetching explore posts:", error);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const getHighestEngagement = () => {
    if (posts.length === 0) return 0;
    const max = Math.max(...posts.map(p => p._count.likes + p._count.comments + p._count.reposts));
    return max;
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-4">
        <Compass className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Explore</h1>
        <div className="ml-auto flex items-center gap-1 bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-sm">
          <Flame className="w-4 h-4 fill-orange-500 text-orange-500" />
          <span>Trending</span>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Discover the most engaging posts from the community
      </p>

      {posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200 text-center">
          <p className="text-gray-500">No posts to explore yet</p>
          <p className="text-sm text-gray-400 mt-1">Be the first to post something!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top engagement badge */}
          {posts.length > 0 && (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-3 text-center">
              <span className="text-sm text-orange-700">
                🔥 Most engaging post has {getHighestEngagement()} interactions
              </span>
            </div>
          )}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchExplorePosts} />
          ))}
        </div>
      )}
    </div>
  );
}
