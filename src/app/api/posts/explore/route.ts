"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import PostCard from "@/components/PostCard";

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
    quotedBy: number; // ✅ required
  };
  liked?: boolean;
}

export default function ExplorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(true);
      const res = await fetch("/api/posts/explore");
      if (!res.ok) throw new Error("Failed to fetch explore posts");
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load explore posts");
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

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-yellow-500" />
          Explore
        </h1>
        <span className="text-sm text-gray-500 ml-auto">{posts.length} posts</span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p>No trending posts yet.</p>
          <p className="text-sm">Check back later for fresh content.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchExplorePosts} />
          ))}
        </div>
      )}
    </div>
  );
}
