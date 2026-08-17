"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, ArrowLeft } from "lucide-react";

interface OwnPost {
  id: string;
  content: string;
  imageUrl: string | null;
  imageUrls: string[];
}

export default function NewAdCampaign() {
  const { data: session } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [name, setName] = useState("");
  const [bidType, setBidType] = useState<"CPC" | "CPM">("CPC");
  const [bidAmount, setBidAmount] = useState("0.25");
  const [budgetTotal, setBudgetTotal] = useState("50");
  const [targetUrl, setTargetUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.username) return;
    fetch(`/api/users/${session.user.username}/posts`)
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setPosts(data.posts || data || []))
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, [session?.user?.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPostId) {
      setError("Choose a post to promote.");
      return;
    }
    if (!name.trim()) {
      setError("Give this campaign a name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: selectedPostId,
          name: name.trim(),
          bidType,
          bidAmount: parseFloat(bidAmount),
          budgetTotal: parseFloat(budgetTotal),
          targetUrl: targetUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/ads");
      } else {
        setError(data.error || "Failed to create campaign.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <Link href="/ads" className="inline-flex items-center gap-1 text-sm text-zrp-red hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to campaigns
      </Link>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-zrp-red" />
        New ad campaign
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Campaigns go through a quick review before they start serving.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Campaign name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Internal name, not shown publicly"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            maxLength={80}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Post to promote
          </label>
          {loadingPosts ? (
            <p className="text-sm text-gray-400">Loading your posts...</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-gray-400">
              You don't have any posts yet - create one first, then come back here to promote it.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
              {posts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPostId(post.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedPostId === post.id
                      ? "border-zrp-red bg-zrp-red/5"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{post.content}</p>
                  {(post.imageUrl || post.imageUrls?.[0]) && (
                    <img
                      src={post.imageUrls?.[0] || post.imageUrl || ""}
                      alt=""
                      className="mt-2 rounded-lg max-h-24 object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bid type
            </label>
            <select
              value={bidType}
              onChange={(e) => setBidType(e.target.value as "CPC" | "CPM")}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="CPC">Cost per click (CPC)</option>
              <option value="CPM">Cost per 1,000 views (CPM)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {bidType === "CPC" ? "Cost per click ($)" : "Cost per 1,000 views ($)"}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Total budget ($)
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={budgetTotal}
            onChange={(e) => setBudgetTotal(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <p className="text-xs text-gray-400 mt-1">
            The campaign automatically stops serving once this is spent.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link when clicked (optional)
          </label>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://your-site.com - leave blank to just open the post"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedPostId}
          className="w-full bg-zrp-red text-white py-2.5 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? "Submitting..." : "Submit for review"}
        </button>
      </form>
    </div>
  );
}
