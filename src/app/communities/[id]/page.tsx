"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Users, Hash } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/ui/EmptyState";

const CATEGORY_KEY: Record<string, string> = {
  TRAVEL: "communities.category.travel",
  PHOTOGRAPHY: "communities.category.photography",
  NATURE: "communities.category.nature",
  TECHNOLOGY: "communities.category.technology",
  HEALTH_FITNESS: "communities.category.healthFitness",
  ART_DESIGN: "communities.category.artDesign",
  GENERAL: "communities.category.general",
};

export default function CommunityDetailPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [community, setCommunity] = useState<any>(null);
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/communities/${params.id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setCommunity(data.community);
      setIsMember(data.isMember);
      setMyRole(data.myRole);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const res = await fetch(`/api/communities/${params.id}/feed`, { cache: "no-store" });
      const data = await res.json();
      setPosts(data.posts || []);
    } finally {
      setFeedLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (status === "authenticated") {
      loadCommunity();
      loadFeed();
    }
  }, [status, loadCommunity, loadFeed]);

  const toggleMembership = async () => {
    const next = !isMember;
    setIsMember(next);
    setCommunity((c: any) => (c ? { ...c, memberCount: c.memberCount + (next ? 1 : -1) } : c));
    try {
      const res = await fetch(`/api/communities/${params.id}/${next ? "join" : "leave"}`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      loadCommunity();
    }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  if (notFound || !community) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="font-bold text-lg">{t("communities.detail.notFound")}</div>
        <Link href="/communities" className="text-zrp-red font-semibold">
          {t("communities.title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/communities" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("communities.title")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="font-black text-lg leading-tight truncate">{community.name}</div>
            <div className="text-xs text-gray-500 dark:text-white/50 leading-tight">
              {t(CATEGORY_KEY[community.category] as any)}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-600 dark:text-white/70">{community.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-white/50">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" /> {t("communities.memberCount", { n: community.memberCount })}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="w-4 h-4" /> {community.hashtag}
            </span>
            {myRole === "OWNER" && (
              <span className="px-2 py-0.5 rounded-full bg-zrp-red/10 text-zrp-red text-xs font-bold">
                {t("communities.detail.ownerBadge")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={toggleMembership}
            className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold ${
              isMember
                ? "border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/70"
                : "bg-zrp-red text-white"
            }`}
          >
            {isMember ? t("communities.joined") : t("communities.join")}
          </button>
        </div>

        <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-6">
          {feedLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={Hash}
              title={t("communities.detail.feedEmptyTitle")}
              body={t("communities.detail.feedEmptyBody", { hashtag: community.hashtag })}
            />
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={loadFeed} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
