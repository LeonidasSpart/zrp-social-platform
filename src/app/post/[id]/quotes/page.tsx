"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";

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
  _count: {
    likes: number;
    comments: number;
    reposts: number;
    quotedBy: number;
  };
  liked?: boolean;
}

export default function QuotesPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [quotes, setQuotes] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchQuotes();
    }
  }, [status, params.id]);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/posts/${params.id}/quotes`);
      if (!res.ok) throw new Error(t("quotes.errFetch"));
      const data = await res.json();
      setQuotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("quotes.errLoad"));
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/post/${params.id}`} className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("quotes.title")}</h1>
        <span className="text-sm text-gray-500 ml-auto">{t("quotes.count", { n: quotes.length })}</span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{t("quotes.empty")}</div>
      ) : (
        <div>
          {quotes.map((post) => (
            <PostCard key={post.id} post={post} onUpdate={fetchQuotes} />
          ))}
        </div>
      )}
    </div>
  );
}
