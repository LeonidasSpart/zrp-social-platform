"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

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
    quotedBy: number; // ✅ REQUIRED
  };
  liked?: boolean;
}

export default function ExplorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") fetchExplorePosts();
  }, [status]);

  const fetchExplorePosts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts/explore");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      // /api/posts/explore now returns { posts, nextCursor } for pagination
      // instead of a bare array - fall back to the old shape just in case.
      setPosts(data.posts || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("explore.errFailedLoad"));
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {/* One page header for the app: same geometry, same 44px back
          target, same truncating title, same trailing slot - instead of
          each surface hand-rolling its own row. The back control keeps
          exactly the destination it had (home), rather than switching to
          history.back(), so nothing about navigation changes here. */}
      <PageHeader
        icon={Sparkles}
        title={t("explore.title")}
        back={() => router.push("/")}
        trailing={
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t("explore.postCount", { n: posts.length })}
          </span>
        }
        className="-mx-4 mb-6"
      />

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("explore.noTrending")} />
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
