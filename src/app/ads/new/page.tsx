"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OwnPost {
  id: string;
  content: string;
  imageUrl: string | null;
  imageUrls: string[];
}

export default function NewAdCampaign() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
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
      setError(t("ads.new.errChoosePost"));
      return;
    }
    if (!name.trim()) {
      setError(t("ads.new.errCampaignName"));
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
        setError(data.error || t("ads.new.errFailedCreate"));
      }
    } catch {
      setError(t("ads.new.errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <Link href="/ads" className="inline-flex items-center gap-1 text-sm text-zrp-red hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("ads.new.backToCampaigns")}
      </Link>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-zrp-red" />
        {t("ads.new.title")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("ads.new.subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("ads.new.campaignName")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("ads.new.campaignNamePlaceholder")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            maxLength={80}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t("ads.new.postToPromote")}
          </label>
          {loadingPosts ? (
            <p className="text-sm text-gray-400">{t("ads.new.loadingPosts")}</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-gray-400">
              {t("ads.new.noPosts")}
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
              {t("ads.new.bidType")}
            </label>
            <select
              value={bidType}
              onChange={(e) => setBidType(e.target.value as "CPC" | "CPM")}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="CPC">{t("ads.new.bidTypeCpc")}</option>
              <option value="CPM">{t("ads.new.bidTypeCpm")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {bidType === "CPC" ? t("ads.new.costPerClick") : t("ads.new.costPer1000Views")}
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
            {t("ads.new.totalBudget")}
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
            {t("ads.new.budgetHint")}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("ads.new.linkWhenClicked")}
          </label>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder={t("ads.new.linkPlaceholder")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedPostId}
          className="w-full bg-zrp-red text-white py-2.5 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? t("ads.new.submitting") : t("ads.new.submitForReview")}
        </button>
      </form>
    </div>
  );
}
