"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Megaphone, CheckCircle, XCircle, DollarSign } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: "ads.status.draft",
  PENDING_REVIEW: "ads.status.pendingReview",
  ACTIVE: "ads.status.active",
  PAUSED: "ads.status.paused",
  COMPLETED: "ads.status.completed",
  REJECTED: "ads.status.rejected",
};

interface Campaign {
  id: string;
  name: string;
  bidType: "CPC" | "CPM";
  bidAmount: number;
  budgetTotal: number;
  status: string;
  createdAt: string;
  advertiser: { id: string; username: string; name: string; email: string };
  post: { id: string; content: string; imageUrl: string | null; imageUrls: string[] };
}

export default function AdminAdsReview() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ads?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching ad campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleReview = async (id: string, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/admin/ads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rejectionReason: action === "reject" ? rejectionReason : undefined,
        }),
      });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        setRejectingId(null);
        setRejectionReason("");
      }
    } catch (error) {
      console.error("Error reviewing campaign:", error);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-zrp-red" />
        {t("adminAds.title")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("adminAds.subtitle")}
      </p>

      <div className="flex gap-2 mb-4">
        {["PENDING_REVIEW", "ACTIVE", "REJECTED", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              statusFilter === s
                ? "bg-zrp-red text-white border-zrp-red"
                : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
            }`}
          >
            {s === "all" ? t("adminAds.filterAll") : t(STATUS_LABEL_KEYS[s] ?? "ads.status.draft")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-gray-400 text-center py-8">{t("adminAds.noCampaignsHere")}</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="bg-white dark:bg-zrp-deepBlack border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                  <Link
                    href={`/profile/${c.advertiser.username}`}
                    className="text-sm text-zrp-red hover:underline"
                  >
                    @{c.advertiser.username}
                  </Link>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                    {c.post.content}
                  </p>
                  {(c.post.imageUrl || c.post.imageUrls?.[0]) && (
                    <img
                      src={c.post.imageUrls?.[0] || c.post.imageUrl || ""}
                      alt=""
                      className="mt-2 rounded-lg max-h-40 object-cover"
                    />
                  )}
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <DollarSign className="w-3.5 h-3.5" />
                    {t("adminAds.budgetSummary", { bidType: c.bidType, bidAmount: c.bidAmount, budgetTotal: c.budgetTotal })}
                  </div>
                </div>

                <span className="text-xs text-gray-400 flex-shrink-0">{t(STATUS_LABEL_KEYS[c.status] ?? "ads.status.draft")}</span>
              </div>

              {statusFilter === "PENDING_REVIEW" && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {rejectingId === c.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder={t("adminAds.rejectionPlaceholder")}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(c.id, "reject")}
                          disabled={processingId === c.id}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-full hover:bg-red-700 disabled:opacity-50"
                        >
                          {t("adminAds.confirmReject")}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(null);
                            setRejectionReason("");
                          }}
                          className="px-3 py-1.5 text-sm text-gray-500"
                        >
                          {t("action.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(c.id, "approve")}
                        disabled={processingId === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-full hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t("adminAds.approve")}
                      </button>
                      <button
                        onClick={() => setRejectingId(c.id)}
                        disabled={processingId === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-full disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        {t("adminAds.reject")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
