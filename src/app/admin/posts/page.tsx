"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: { username: string; name: string };
  _count: { likes: number; comments: number };
}

export default function AdminPosts() {
  const { t, language } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Which post is open for inspection, if any. Holding the whole row
  // rather than an id means the detail view needs no second request -
  // /api/admin/posts already returns the full content, author and
  // counts, which is everything the list itself displays.
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/posts?search=${encodeURIComponent(search)}&page=${page}`);
      const data = await res.json();
      setPosts(data.posts);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [page, search]);

  const handleDelete = async (postId: string) => {
    if (!confirm(t("adminPosts.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      if (res.ok) fetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
    }
  };

  /*
   * Detail view. Rendered in place, inside the Admin layout, so the
   * sidebar and the admin session stay exactly where they were.
   *
   * Nothing about the list is thrown away while this is open: `posts`,
   * `search`, `page` and `totalPages` all still hold their values in
   * this component's state, so Back is a pure state change - no refetch,
   * no route change, and the administrator lands back on the same page
   * of the same search they were moderating.
   */
  if (selectedPost) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedPost(null)}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-zrp-red hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("adminPosts.title")}
        </button>

        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="whitespace-pre-wrap break-words text-gray-900 dark:text-white">
            {selectedPost.content}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span>{t("adminPosts.by", { name: selectedPost.author.name || selectedPost.author.username })}</span>
            <span>❤️ {selectedPost._count.likes}</span>
            <span>💬 {selectedPost._count.comments}</span>
            <span>{new Date(selectedPost.createdAt).toLocaleString(localeMap[language] || "en-US")}</span>
          </div>

          {/* Moderation stays available from here, so inspecting a post
              and acting on it is one continuous flow rather than a
              round trip back to the list. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                const id = selectedPost.id;
                await handleDelete(id);
                setSelectedPost(null);
              }}
              className="text-sm font-medium text-red-600 hover:text-red-800"
            >
              {t("adminPosts.delete")}
            </button>

            {/* The only remaining new tab, and now an explicit choice
                rather than what happens when you click a post. */}
            <Link
              href={`/post/${selectedPost.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {/* Reuses the existing, already-translated
                  adminReports.viewPost ("View Post") rather than adding
                  a 12th string that would need translating into all 11
                  languages. */}
              {t("adminReports.viewPost")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t("adminPosts.title")}</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder={t("adminPosts.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="py-12 text-center text-gray-500" role="status">
            {t("action.loading")}
          </div>
        ) : (
        posts.map((post) => (
          <div key={post.id} className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start">
              {/* Was a Link to /post/[id] with target="_blank": clicking
                  a post threw the administrator out of the dashboard into
                  a new tab on the public page, losing the section, the
                  search and the page they were on. It opens in place
                  now. */}
              <button
                type="button"
                onClick={() => setSelectedPost(post)}
                className="flex-1 min-w-0 text-left hover:opacity-80 transition"
              >
                <p className="line-clamp-3 text-gray-900 dark:text-white hover:underline">{post.content}</p>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>{t("adminPosts.by", { name: post.author.name || post.author.username })}</span>
                  <span>❤️ {post._count.likes}</span>
                  <span>💬 {post._count.comments}</span>
                  <span>{new Date(post.createdAt).toLocaleString(localeMap[language] || "en-US")}</span>
                </div>
              </button>
              <button
                onClick={() => handleDelete(post.id)}
                className="text-red-600 hover:text-red-800 text-sm font-medium ml-4 flex-shrink-0"
              >
                {t("adminPosts.delete")}
              </button>
            </div>
          </div>
        )))}
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1 border rounded disabled:opacity-50">{t("adminPosts.previous")}</button>
          <span className="px-3 py-1">{t("adminPosts.pageOf", { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-3 py-1 border rounded disabled:opacity-50">{t("adminPosts.next")}</button>
        </div>
      )}
    </div>
  );
}
