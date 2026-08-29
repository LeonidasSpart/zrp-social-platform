"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Megaphone, Plus, Pause, Play } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface Campaign {
  id: string;
  name: string;
  status: string;
  bidType: "CPC" | "CPM";
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
  rejectionReason: string | null;
  post: { content: string; imageUrl: string | null; imageUrls: string[] };
  _count: { impressions: number; clicks: number };
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PAUSED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  COMPLETED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: "ads.status.draft",
  PENDING_REVIEW: "ads.status.pendingReview",
  ACTIVE: "ads.status.active",
  PAUSED: "ads.status.paused",
  COMPLETED: "ads.status.completed",
  REJECTED: "ads.status.rejected",
};

export default function AdsDashboard() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/ads/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") fetchCampaigns();
  }, [status]);

  const togglePause = async (campaign: Campaign) => {
    setTogglingId(campaign.id);
    const nextStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/ads/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaign.id ? { ...c, status: nextStatus } : c))
        );
      }
    } catch (error) {
      console.error("Error toggling campaign:", error);
    } finally {
      setTogglingId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-zrp-red" />
          {t("ads.dashboard.title")}
        </h1>
        <Link
          href="/ads/new"
          className="inline-flex items-center gap-1.5 bg-zrp-red text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
        >
          <Plus className="w-4 h-4" />
          {t("ads.dashboard.newCampaign")}
        </Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("ads.dashboard.subtitle")}
      </p>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">{t("ads.dashboard.noCampaigns")}</p>
          <Link href="/ads/new" className="text-zrp-red hover:underline text-sm">
            {t("ads.dashboard.createFirst")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const ctr = c._count.impressions > 0
              ? ((c._count.clicks / c._count.impressions) * 100).toFixed(2)
              : "0.00";
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-zrp-deepBlack border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                      {c.post.content}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[c.status] || ""}`}>
                    {t(STATUS_LABEL_KEYS[c.status] ?? "ads.status.draft")}
                  </span>
                </div>

                {c.status === "REJECTED" && c.rejectionReason && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    {t("ads.dashboard.rejectedPrefix", { reason: c.rejectionReason })}
                  </p>
                )}

                <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="font-bold text-gray-900 dark:text-white">{c._count.impressions}</p>
                    <p className="text-gray-500 dark:text-gray-400">{t("ads.dashboard.views")}</p>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="font-bold text-gray-900 dark:text-white">{c._count.clicks}</p>
                    <p className="text-gray-500 dark:text-gray-400">{t("ads.dashboard.clicks")}</p>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="font-bold text-gray-900 dark:text-white">{ctr}%</p>
                    <p className="text-gray-500 dark:text-gray-400">{t("ads.dashboard.ctr")}</p>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="font-bold text-gray-900 dark:text-white">
                      ${c.budgetSpent.toFixed(2)}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {t("ads.dashboard.ofBudget", { amount: c.budgetTotal })}
                    </p>
                  </div>
                </div>

                {(c.status === "ACTIVE" || c.status === "PAUSED") && (
                  <button
                    onClick={() => togglePause(c)}
                    disabled={togglingId === c.id}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-zrp-red transition disabled:opacity-50"
                  >
                    {c.status === "ACTIVE" ? (
                      <>
                        <Pause className="w-3.5 h-3.5" /> {t("ads.dashboard.pauseCampaign")}
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> {t("ads.dashboard.resumeCampaign")}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
