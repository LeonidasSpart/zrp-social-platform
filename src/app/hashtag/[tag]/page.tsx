"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── PREVENT STATIC GENERATION ─────────────────────────────────────
export const dynamic = 'force-dynamic';

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
    quotedBy: number; // ✅ added
  };
  liked?: boolean;
}

export default function HashtagPage(props: { params: Promise<{ tag: string }> }) {
  const params = use(props.params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
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
      fetchPosts();
    }
  }, [params.tag, status]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/posts/hashtag/${params.tag}`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("hashtag.errLoad"));
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("action.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link href="/" className="text-zrp-red hover:underline text-sm">
          {t("hashtag.backToHome")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          #{params.tag}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {t("hashtag.postCount", { n: posts.length, word: posts.length === 1 ? t("action.post").toLowerCase() : t("profile.posts").toLowerCase() })}
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{t("hashtag.noPosts", { tag: params.tag })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchPosts} />
          ))}
        </div>
      )}
    </div>
  );
}
