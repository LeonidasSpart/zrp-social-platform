"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: { username: string; name: string };
  _count: { likes: number; comments: number };
}

export default function AdminPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
    if (!confirm("Delete this post?")) return;
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      if (res.ok) fetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Posts</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search posts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        {posts.map((post) => (
          <div key={post.id} className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 dark:text-white">{post.content}</p>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>By {post.author.name || post.author.username}</span>
                  <span>❤️ {post._count.likes}</span>
                  <span>💬 {post._count.comments}</span>
                  <span>{new Date(post.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(post.id)}
                className="text-red-600 hover:text-red-800 text-sm font-medium ml-4"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1 border rounded disabled:opacity-50">Previous</button>
          <span className="px-3 py-1">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
