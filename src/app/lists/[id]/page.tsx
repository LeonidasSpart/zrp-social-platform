"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Lock, UserMinus, Trash2 } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/ui/EmptyState";
import { ListChecks } from "lucide-react";

export default function ListDetailPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [list, setList] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [addUsername, setAddUsername] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${params.id}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setList(data.list);
      setIsOwner(data.isOwner);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const res = await fetch(`/api/lists/${params.id}/feed`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPosts(data.posts || []);
    } finally {
      setFeedLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (status === "authenticated") {
      loadList();
      loadFeed();
    }
  }, [status, loadList, loadFeed]);

  const addMember = async () => {
    if (!addUsername.trim()) return;
    setAddBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: addUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("lists.errorAddMember"));
      setAddUsername("");
      loadList();
      loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lists.errorAddMember"));
    } finally {
      setAddBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/lists/${params.id}/members/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadList();
      loadFeed();
    } catch {
      setError(t("lists.errorRemoveMember"));
    }
  };

  const deleteList = async () => {
    if (!confirm(t("lists.detail.deleteConfirm"))) return;
    const res = await fetch(`/api/lists/${params.id}`, { method: "DELETE" });
    if (res.ok) router.push("/lists");
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="font-bold text-lg">{t("lists.detail.notFound")}</div>
        <Link href="/lists" className="text-zrp-red font-semibold">{t("lists.title")}</Link>
      </div>
    );
  }

  if (forbidden || !list) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Lock className="w-8 h-8 text-gray-400" />
        <div className="font-bold text-lg">{t("lists.detail.privateNotice")}</div>
        <Link href="/lists" className="text-zrp-red font-semibold">{t("lists.title")}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/lists" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("lists.title")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-black text-lg truncate">{list.name}</span>
            {list.isPrivate && <Lock className="w-4 h-4 text-gray-400 shrink-0" />}
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={deleteList}
              className="ml-auto w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 shrink-0"
              aria-label={t("lists.detail.deleteButton")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {list.description && <p className="text-sm text-gray-600 dark:text-white/70">{list.description}</p>}

        {error && (
          <div role="alert" aria-live="polite" className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {isOwner && (
          <div className="mt-4 flex items-center gap-2">
            <input
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
              placeholder={t("lists.detail.addMemberPlaceholder")}
              aria-label={t("lists.detail.addMemberPlaceholder")}
              className="flex-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none text-sm"
            />
            <button
              type="button"
              disabled={addBusy || !addUsername.trim()}
              onClick={addMember}
              className="h-10 px-4 rounded-full bg-zrp-red text-white font-bold text-sm disabled:opacity-40 shrink-0"
            >
              {t("lists.detail.addMemberButton")}
            </button>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-bold text-gray-500 dark:text-white/50 mb-2">
            {t("lists.detail.membersHeading")} ({list.memberCount})
          </h2>
          {list.members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-white/40">{t("lists.detail.emptyMembers")}</p>
          ) : (
            <div className="space-y-1">
              {list.members.map((m: any) => (
                <div key={m.user.id} className="flex items-center gap-2.5 py-1.5">
                  <img
                    src={m.user.avatarUrl || "/default-avatar.png"}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <Link href={`/profile/${m.user.username}`} className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {m.user.name || m.user.username}
                  </Link>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.user.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 shrink-0"
                      aria-label={t("lists.detail.removeMemberAria", { name: m.user.name || m.user.username })}
                    >
                      <UserMinus className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-6">
          {feedLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
            </div>
          ) : posts.length === 0 ? (
            <EmptyState icon={ListChecks} title={t("lists.detail.feedEmptyTitle")} body={t("lists.detail.feedEmptyBody")} />
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
