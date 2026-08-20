"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Edit3,
  Eye,
  FileText,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

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

type NewsStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Author = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
};

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
  status: NewsStatus;
  views: number;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author: Author;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

const categories: Array<{
  value: NewsCategory;
  label: string;
}> = [
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

const statuses: Array<{
  value: NewsStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

function formatDate(date: string | null) {
  if (!date) return "Not published";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "Unknown";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function emptyForm() {
  return {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    sourceName: "",
    sourceUrl: "",
    category: "WORLD" as NewsCategory,
    status: "DRAFT" as NewsStatus,
    authorId: "",
    featured: false,
    publishedAt: "",
  };
}

export default function AdminNewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<NewsStatus | "">("");
  const [category, setCategory] = useState<NewsCategory | "">("");
  const [page, setPage] = useState(1);

  const [showEditor, setShowEditor] = useState(false);
  const [editingArticle, setEditingArticle] =
    useState<NewsArticle | null>(null);

  const [form, setForm] = useState(emptyForm());

  const totalPublished = useMemo(
    () => articles.filter((article) => article.status === "PUBLISHED").length,
    [articles]
  );

  const totalDrafts = useMemo(
    () => articles.filter((article) => article.status === "DRAFT").length,
    [articles]
  );

  async function loadArticles(targetPage = page) {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      params.set("page", String(targetPage));
      params.set("limit", "20");

      if (status) {
        params.set("status", status);
      }

      if (category) {
        params.set("category", category);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/admin/news?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load news");
      }

      setArticles(data.articles || []);
      setPagination(data.pagination || null);
      setPage(targetPage);
    } catch (err) {
      console.error("Admin News load error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load news articles."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArticles(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  function openCreate() {
    setEditingArticle(null);
    setForm(emptyForm());
    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function openEdit(article: NewsArticle) {
    setEditingArticle(article);

    setForm({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt || "",
      content: article.content,
      coverImage: article.coverImage || "",
      sourceName: article.sourceName || "",
      sourceUrl: article.sourceUrl || "",
      category: article.category,
      status: article.status,
      authorId: article.author.id,
      featured: article.featured,
      publishedAt: article.publishedAt
        ? new Date(article.publishedAt).toISOString().slice(0, 16)
        : "",
    });

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function closeEditor() {
    if (saving) return;

    setShowEditor(false);
    setEditingArticle(null);
    setForm(emptyForm());
  }

  function updateForm(
    field: keyof ReturnType<typeof emptyForm>,
    value: string | boolean
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!form.title.trim()) {
        throw new Error("Title is required.");
      }

      if (!form.slug.trim()) {
        throw new Error("Slug is required.");
      }

      if (!form.content.trim()) {
        throw new Error("Content is required.");
      }

      if (!form.authorId.trim()) {
        throw new Error("Author ID is required.");
      }

      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content,
        coverImage: form.coverImage.trim() || null,
        sourceName: form.sourceName.trim() || null,
        sourceUrl: form.sourceUrl.trim() || null,
        category: form.category,
        status: form.status,
        authorId: form.authorId.trim(),
        featured: form.featured,
        publishedAt: form.publishedAt
          ? new Date(form.publishedAt).toISOString()
          : null,
      };

      const url = editingArticle
        ? `/api/admin/news/${editingArticle.id}`
        : "/api/admin/news";

      const response = await fetch(url, {
        method: editingArticle ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            `Failed to ${editingArticle ? "update" : "create"} article`
        );
      }

      setSuccess(
        editingArticle
          ? "News article updated successfully."
          : "News article created successfully."
      );

      setShowEditor(false);
      setEditingArticle(null);
      setForm(emptyForm());

      await loadArticles(page);
    } catch (err) {
      console.error("Admin News save error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save news article."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteArticle(article: NewsArticle) {
    const confirmed = window.confirm(
      `Delete "${article.title}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleting(article.id);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/news/${article.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete article");
      }

      setSuccess("News article deleted successfully.");

      const shouldGoBack =
        articles.length === 1 && page > 1;

      await loadArticles(shouldGoBack ? page - 1 : page);
    } catch (err) {
      console.error("Admin News delete error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete news article."
      );
    } finally {
      setDeleting(null);
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadArticles(1);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-red-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Link>

            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              ZRP News
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create, edit and manage ZRP News articles.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            <Plus className="h-5 w-5" />
            New Article
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            <span>{success}</span>

            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Total Articles
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {pagination?.total ?? 0}
                </p>
              </div>

              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Published on Page
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {totalPublished}
                </p>
              </div>

              <div className="rounded-xl bg-green-100 p-3 dark:bg-green-900/30">
                <Eye className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Drafts on Page
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {totalDrafts}
                </p>
              </div>

              <div className="rounded-xl bg-yellow-100 p-3 dark:bg-yellow-900/30">
                <FileText className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <form
            onSubmit={handleSearchSubmit}
            className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto_auto]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, slug or content..."
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
            </div>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as NewsStatus | "")
              }
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            >
              <option value="">All Statuses</option>

              {statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as NewsCategory | "")
              }
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            >
              <option value="">All Categories</option>

              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Search
            </button>
          </form>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <div className="space-y-4 p-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-xl bg-gray-100 p-5 dark:bg-gray-800"
                >
                  <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-3 h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>

              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                No articles found
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create your first ZRP News article.
              </p>

              <button
                type="button"
                onClick={openCreate}
                className="mt-5 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Create Article
              </button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Article
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Category
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Views
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Date
                      </th>

                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {articles.map((article) => (
                      <tr
                        key={article.id}
                        className="transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="max-w-md px-6 py-4">
                          <div className="flex items-start gap-3">
                            {article.coverImage ? (
                              <img
                                src={article.coverImage}
                                alt=""
                                className="h-14 w-20 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-red-600 text-xs font-black text-white">
                                ZRP
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {article.featured && (
                                  <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                                )}

                                <p className="truncate font-semibold text-gray-900 dark:text-white">
                                  {article.title}
                                </p>
                              </div>

                              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                                /news/{article.slug}
                              </p>

                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                by{" "}
                                {article.author.name ||
                                  `@${article.author.username}`}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-400">
                            {article.category}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge status={article.status} />
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {article.views.toLocaleString()}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(
                            article.publishedAt || article.createdAt
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/news/${article.slug}`}
                              target="_blank"
                              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-blue-500 hover:text-blue-600 dark:border-gray-700"
                              title="View article"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => openEdit(article)}
                              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-red-500 hover:text-red-600 dark:border-gray-700"
                              title="Edit article"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              disabled={deleting === article.id}
                              onClick={() => deleteArticle(article)}
                              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-red-500 hover:text-red-600 disabled:opacity-50 dark:border-gray-700"
                              title="Delete article"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
                {articles.map((article) => (
                  <div key={article.id} className="p-4">
                    <div className="flex gap-3">
                      {article.coverImage ? (
                        <img
                          src={article.coverImage}
                          alt=""
                          className="h-20 w-24 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-red-600 text-xs font-black text-white">
                          ZRP
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {article.featured && (
                            <Star className="mt-0.5 h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                          )}

                          <h3 className="line-clamp-2 font-semibold text-gray-900 dark:text-white">
                            {article.title}
                          </h3>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge status={article.status} />

                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {article.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {article.views.toLocaleString()} views
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/news/${article.slug}`}
                          target="_blank"
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 dark:border-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>

                        <button
                          type="button"
                          onClick={() => openEdit(article)}
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 dark:border-gray-700"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          disabled={deleting === article.id}
                          onClick={() => deleteArticle(article)}
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 disabled:opacity-50 dark:border-gray-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => loadArticles(page - 1)}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700"
                    >
                      Previous
                    </button>

                    <button
                      type="button"
                      disabled={
                        !pagination.hasMore || loading
                      }
                      onClick={() => loadArticles(page + 1)}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="mx-auto my-6 max-w-4xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingArticle ? "Edit News Article" : "Create News Article"}
                </h2>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {editingArticle
                    ? `Editing ${editingArticle.slug}`
                    : "Publish a new article to ZRP News."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              {/* Title */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Title
                </label>

                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    const value = event.target.value;

                    updateForm("title", value);

                    if (!editingArticle) {
                      updateForm("slug", slugify(value));
                    }
                  }}
                  placeholder="Article title"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Slug
                </label>

                <input
                  type="text"
                  value={form.slug}
                  onChange={(event) =>
                    updateForm("slug", slugify(event.target.value))
                  }
                  placeholder="article-slug"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  required
                />
              </div>

              {/* Category + Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                    Category
                  </label>

                  <select
                    value={form.category}
                    onChange={(event) =>
                      updateForm(
                        "category",
                        event.target.value as NewsCategory
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  >
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                    Status
                  </label>

                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm(
                        "status",
                        event.target.value as NewsStatus
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  >
                    {statuses.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Excerpt */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Excerpt
                </label>

                <textarea
                  value={form.excerpt}
                  onChange={(event) =>
                    updateForm("excerpt", event.target.value)
                  }
                  rows={3}
                  placeholder="Short article summary..."
                  className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              {/* Content */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Content
                </label>

                <textarea
                  value={form.content}
                  onChange={(event) =>
                    updateForm("content", event.target.value)
                  }
                  rows={14}
                  placeholder="Write the complete news article..."
                  className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  required
                />
              </div>

              {/* Cover image */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Cover Image URL
                </label>

                <input
                  type="url"
                  value={form.coverImage}
                  onChange={(event) =>
                    updateForm("coverImage", event.target.value)
                  }
                  placeholder="https://..."
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              {/* Source */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                    Source Name
                  </label>

                  <input
                    type="text"
                    value={form.sourceName}
                    onChange={(event) =>
                      updateForm("sourceName", event.target.value)
                    }
                    placeholder="Source name"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                    Source URL
                  </label>

                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={(event) =>
                      updateForm("sourceUrl", event.target.value)
                    }
                    placeholder="https://..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>
              </div>

              {/* Author */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Author ID
                </label>

                <input
                  type="text"
                  value={form.authorId}
                  onChange={(event) =>
                    updateForm("authorId", event.target.value)
                  }
                  placeholder="User ID of the article author"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  required
                />

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use the existing ZRP user ID for the editorial author.
                </p>
              </div>

              {/* Publish date */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
                  Published At
                </label>

                <input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(event) =>
                    updateForm("publishedAt", event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              {/* Featured */}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) =>
                    updateForm("featured", event.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />

                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Featured article
                  </p>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Show this article as the featured story on ZRP News.
                  </p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end dark:border-gray-800">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingArticle
                      ? "Update Article"
                      : "Create Article"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: NewsStatus }) {
  const styles: Record<NewsStatus, string> = {
    DRAFT:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    PUBLISHED:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    ARCHIVED:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}
