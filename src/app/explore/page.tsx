"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sparkles, TrendingUp, Search, Users } from "lucide-react";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

type Tab = "forYou" | "trending" | "people" | "communities";

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
    quotedBy: number;
  };
  liked?: boolean;
}

interface PersonResult {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  badgeType?: string | null;
}

interface CommunityPreview {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isMember: boolean;
}

export default function ExplorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [tab, setTab] = useState<Tab>("forYou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [communities, setCommunities] = useState<CommunityPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchPosts = useCallback(async (sort: "forYou" | "trending") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/explore?sort=${sort}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPosts(data.posts || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("explore.errFailedLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchPeople = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=users`);
      const data = await res.json();
      setPeople(data.users || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/communities?limit=6");
      const data = await res.json();
      setCommunities(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (tab === "forYou") fetchPosts("forYou");
    else if (tab === "trending") fetchPosts("trending");
    else if (tab === "communities") fetchCommunities();
    else if (tab === "people" && peopleQuery.trim().length >= 2) fetchPeople(peopleQuery);
    else if (tab === "people") setPeople([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tab]);

  const submitPeopleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (peopleQuery.trim().length >= 2) fetchPeople(peopleQuery);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "forYou", label: t("explore.tabs.forYou") },
    { key: "trending", label: t("explore.tabs.trending") },
    { key: "people", label: t("explore.tabs.people") },
    { key: "communities", label: t("explore.tabs.communities") },
  ];

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen">{t("action.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <PageHeader
        icon={Sparkles}
        title={t("explore.title")}
        back={() => router.push("/")}
        className="-mx-4 mb-4"
      />

      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6 -mt-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${
              tab === tb.key
                ? "border-zrp-red text-gray-950 dark:text-white"
                : "border-transparent text-gray-500 dark:text-white/50"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
          {error}
        </div>
      )}

      {(tab === "forYou" || tab === "trending") && (
        loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState icon={tab === "trending" ? TrendingUp : Sparkles} title={t("explore.noTrending")} />
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={() => fetchPosts(tab === "trending" ? "trending" : "forYou")} />
            ))}
          </div>
        )
      )}

      {tab === "people" && (
        <div>
          <form onSubmit={submitPeopleSearch} className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              placeholder={t("explore.people.searchPlaceholder")}
              aria-label={t("explore.people.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none text-sm"
            />
          </form>
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
            </div>
          ) : people.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t("explore.people.emptyTitle")}
              body={peopleQuery.trim().length >= 2 ? t("explore.people.emptyBody") : undefined}
            />
          ) : (
            <div className="space-y-1">
              {people.map((p) => (
                <Link
                  key={p.id}
                  href={`/profile/${p.username}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <img src={p.avatarUrl || "/default-avatar.png"} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold truncate">{p.name || p.username}</div>
                    <div className="text-sm text-gray-500 dark:text-white/50 truncate">@{p.username}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "communities" && (
        loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : communities.length === 0 ? (
          <EmptyState icon={Users} title={t("communities.emptyTitle")} body={t("communities.emptyBody")} />
        ) : (
          <div>
            <div className="space-y-2 mb-4">
              {communities.map((c) => (
                <Link
                  key={c.id}
                  href={`/communities/${c.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 hover:border-zrp-red/30 transition"
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-xs text-gray-500 dark:text-white/40 truncate">{c.description}</div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-white/40 shrink-0">
                    {t(c.memberCount === 1 ? "communities.memberCountOne" : "communities.memberCountOther", { n: c.memberCount })}
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/communities" className="text-sm font-bold text-zrp-red">
              {t("communities.title")} →
            </Link>
          </div>
        )
      )}
    </div>
  );
}
