"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type NewsCategory =
  | "WORLD"
  | "EUROPE"
  | "SWITZERLAND"
  | "POLITICS"
  | "BUSINESS"
  | "TECHNOLOGY"
  | "CRYPTO"
  | "SCIENCE"
  | "SPORTS"
  | "CULTURE"
  | "COMMUNITY";

type NewsArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  category: NewsCategory;
  status: string;
  views: number;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
};

const categories: Array<{
  value: NewsCategory | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "WORLD", label: "World" },
  { value: "EUROPE", label: "Europe" },
  { value: "SWITZERLAND", label: "Switzerland" },
  { value: "POLITICS", label: "Politics" },
  { value: "BUSINESS", label: "Business" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "SCIENCE", label: "Science" },
  { value: "SPORTS", label: "Sports" },
  { value: "CULTURE", label: "Culture" },
  { value: "COMMUNITY", label: "Community" },
];

function formatDate(date: string | null) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  } catch {
    return "";
  }
}

function formatViews(views: number) {
  if (views < 1000) return views.toString();

  if (views < 1000000) {
    return `${(views / 1000).toFixed(views >= 10000 ? 0 : 1)}K`;
  }

  return `${(views / 1000000).toFixed(views >= 10000000 ? 0 : 1)}M`;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<NewsCategory | "ALL">("ALL");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadNews = useCallback(
    async (loadMore = false) => {
      try {
        if (loadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setError(null);
        }

        const params = new URLSearchParams();

        params.set("limit", "12");

        if (selectedCategory !== "ALL") {
          params.set("category", selectedCategory);
        }

        if (loadMore && nextCursor) {
          params.set("cursor", nextCursor);
        }

        const response = await fetch(`/api/news?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load news");
        }

        if (loadMore) {
          setArticles((current) => [...current, ...data.articles]);
        } else {
          setArticles(data.articles || []);
        }

        setHasMore(Boolean(data.pagination?.hasMore));
        setNextCursor(data.pagination?.nextCursor || null);
      } catch (err) {
        console.error("ZRP News page error:", err);

        if (!loadMore) {
          setError("Unable to load ZRP News right now.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedCategory, nextCursor]
  );

  useEffect(() => {
    setArticles([]);
    setNextCursor(null);
    setHasMore(false);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();

        params.set("limit", "12");

        if (selectedCategory !== "ALL") {
          params.set("category", selectedCategory);
        }

        const response = await fetch(`/api/news?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load news");
        }

        setArticles(data.articles || []);
        setHasMore(Boolean(data.pagination?.hasMore));
        setNextCursor(data.pagination?.nextCursor || null);
      } catch (err) {
        console.error("ZRP News initial load error:", err);
        setError("Unable to load ZRP News right now.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedCategory]);

  const featuredArticle =
    articles.find((article) => article.featured) || articles[0];

  const regularArticles = featuredArticle
    ? articles.filter((article) => article.id !== featuredArticle.id)
    : articles;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-sm font-black text-white">
                  Z
                </span>

                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">
                  ZRP
                </span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                News
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Independent news and stories from Switzerland, Europe and the
                world.
              </p>
            </div>
          </div>
        </header>

        {/* Categories */}
        <div className="mb-6 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {categories.map((category) => {
              const active = selectedCategory === category.value;

              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(category.value);
                    window.scrollTo({
                      top: 0,
                      behavior: "smooth",
                    });
                  }}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-border bg-background text-muted-foreground hover:border-red-500 hover:text-foreground",
                  ].join(" ")}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-600">{error}</p>

            <button
              type="button"
              onClick={() => loadNews(false)}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="aspect-[16/9] animate-pulse bg-muted" />

                <div className="space-y-3 p-5">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && articles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-2xl">
              📰
            </div>

            <h2 className="text-xl font-semibold">No news yet</h2>

            <p className="mt-2 text-sm text-muted-foreground">
              There are no published articles in this category yet.
            </p>
          </div>
        )}

        {/* Featured article */}
        {!loading && featuredArticle && (
          <section className="mb-8">
            <Link
              href={`/news/${featuredArticle.slug}`}
              className="group block overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="grid lg:grid-cols-[1.35fr_1fr]">
                <div className="relative aspect-[16/10] overflow-hidden bg-muted lg:aspect-auto lg:min-h-[360px]">
                  {featuredArticle.coverImage ? (
                    <img
                      src={featuredArticle.coverImage}
                      alt={featuredArticle.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center bg-gradient-to-br from-red-600 to-red-900">
                      <span className="text-7xl font-black text-white/90">
                        ZRP
                      </span>
                    </div>
                  )}

                  <div className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    Featured
                  </div>
                </div>

                <div className="flex flex-col justify-center p-6 sm:p-8">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                    <span className="rounded-full bg-red-600/10 px-3 py-1 text-red-600">
                      {featuredArticle.category}
                    </span>

                    {featuredArticle.sourceName && (
                      <span className="text-muted-foreground">
                        {featuredArticle.sourceName}
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                    {featuredArticle.title}
                  </h2>

                  {featuredArticle.excerpt && (
                    <p className="mt-4 line-clamp-4 text-sm leading-6 text-muted-foreground sm:text-base">
                      {featuredArticle.excerpt}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {featuredArticle.author.name ||
                        `@${featuredArticle.author.username}`}
                    </span>

                    <span>•</span>

                    <span>
                      {formatDate(featuredArticle.publishedAt)}
                    </span>

                    <span>•</span>

                    <span>
                      {formatViews(featuredArticle.views)} views
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Article grid */}
        {!loading && regularArticles.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Latest News</h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {regularArticles.map((article) => (
                <Link
                  key={article.id}
                  href={`/news/${article.slug}`}
                  className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                    {article.coverImage ? (
                      <img
                        src={article.coverImage}
                        alt={article.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-red-600 to-red-900">
                        <span className="text-4xl font-black text-white/90">
                          ZRP
                        </span>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                      {article.category}
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="line-clamp-3 text-lg font-bold leading-snug">
                      {article.title}
                    </h3>

                    {article.excerpt && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {article.excerpt}
                      </p>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">
                        {article.author.name ||
                          `@${article.author.username}`}
                      </span>

                      <span className="shrink-0">
                        {formatDate(article.publishedAt)}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatViews(article.views)} views
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => loadNews(true)}
              className="rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition hover:border-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
