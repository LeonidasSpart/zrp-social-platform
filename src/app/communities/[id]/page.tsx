"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Users, Hash, Trash2 } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";

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
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [community, setCommunity] = useState<any>(null);
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/communities/${params.id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCommunity(data.community);
      setIsMember(data.isMember);
      setMyRole(data.myRole);
    } catch {
      // A network/server failure previously left `community` null with
      // neither `notFound` nor any error flag set, so it fell through
      // to the "not found" screen below - indistinguishable from a
      // community that genuinely doesn't exist.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(false);
    try {
      const res = await fetch(`/api/communities/${params.id}/feed`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setFeedError(true);
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

  const deleteCommunity = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/communities/${params.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/communities");
    } catch {
      setDeleteError(t("communities.detail.deleteError"));
      setDeleting(false);
    }
  };

  const isCreator = !!session?.user?.id && community?.createdBy?.id === session.user.id;

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-gray-500 dark:text-white/50">{t("communities.errorLoad")}</p>
        <button
          type="button"
          onClick={loadCommunity}
          className="px-4 py-1.5 rounded-full border border-gray-300 dark:border-white/15 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition"
        >
          {t("action.retry")}
        </button>
      </div>
    );
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
            <ArrowLeft className="w-5 h-5 rtl:-scale-x-100" />
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
              <Users className="w-4 h-4" /> {t(community.memberCount === 1 ? "communities.memberCountOne" : "communities.memberCountOther", { n: community.memberCount })}
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
          <div className="flex items-center gap-2 shrink-0">
            {isCreator && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={t("communities.detail.deleteButton")}
                className="h-9 w-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-zrp-red dark:text-white/50 dark:hover:bg-white/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleMembership}
              className={`h-9 px-4 rounded-full text-sm font-bold ${
                isMember
                  ? "border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/70"
                  : "bg-zrp-red text-white"
              }`}
            >
              {isMember ? t("communities.joined") : t("communities.join")}
            </button>
          </div>
        </div>

        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-zrp-red">
            {deleteError}
          </p>
        )}

        <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-6">
          {feedLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
            </div>
          ) : feedError ? (
            <div className="text-center py-12 text-gray-500 dark:text-white/50">
              <p>{t("communities.detail.feedErrorLoad")}</p>
              <button
                type="button"
                onClick={loadFeed}
                className="mt-3 px-4 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                {t("action.retry")}
              </button>
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

      {showDeleteConfirm && (
        <ConfirmModal
          title={t("communities.detail.deleteConfirmTitle")}
          body={t("communities.detail.deleteConfirmBody", { name: community.name, hashtag: community.hashtag })}
          confirmLabel={t("communities.detail.deleteConfirmAction")}
          cancelLabel={t("action.cancel")}
          destructive
          busy={deleting}
          onConfirm={deleteCommunity}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
