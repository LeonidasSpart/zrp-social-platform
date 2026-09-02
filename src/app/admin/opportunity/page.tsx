"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, ExternalLink, CheckCircle, XCircle, ShieldOff, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { TYPE_META, type OpportunitySummary } from "@/lib/opportunity";

interface AdminListing extends OpportunitySummary {
  id: string;
  poster: { id: string; username: string; name: string | null; avatarUrl: string | null; badgeType: string | null };
}

export default function AdminOpportunityPage() {
  const { t } = useLanguage();

  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<"reject" | "remove">("reject");
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchListings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/opportunity?status=${statusFilter}&page=${page}`);
      const data = await res.json();
      setListings(data.listings || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching opportunity listings for review:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const runAction = async (id: string, action: "approve" | "reject" | "remove", reason?: string) => {
    try {
      const res = await fetch(`/api/admin/opportunity/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: t("adminOpportunity.actionSuccess") });
        fetchListings();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || t("adminReports.errUpdateFailed") });
      }
    } catch {
      setMessage({ type: "error", text: t("adminReports.errSomethingWrong") });
    }
  };

  const openRejectModal = (id: string, action: "reject" | "remove") => {
    setSelectedId(id);
    setModalAction(action);
    setRejectionReason("");
    setModalOpen(true);
  };

  const submitModal = async () => {
    if (!selectedId) return;
    await runAction(selectedId, modalAction, rejectionReason);
    setModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Briefcase className="w-6 h-6" />
          {t("adminOpportunity.title")}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
        >
          <option value="all">{t("adminReports.all")}</option>
          <option value="PENDING_REVIEW">{t("opportunity.statusPendingReview")}</option>
          <option value="ACTIVE">{t("opportunity.statusActive")}</option>
          <option value="REJECTED">{t("opportunity.statusRejected")}</option>
          <option value="REMOVED">{t("opportunity.statusRemoved")}</option>
        </select>
      </div>

      {message && (
        <div className={`p-3 rounded-lg mb-4 ${
          message.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {listings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t("adminOpportunity.noListings")}</div>
        ) : (
          listings.map((listing) => {
            const meta = TYPE_META[listing.type];
            return (
              <div key={listing.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">{t(meta.labelKey)}</span>
                      <Link
                        href={`/profile/${listing.poster.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                      >
                        <ExternalLink className="w-3 h-3" />
                        @{listing.poster.username}
                      </Link>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white mt-1">{listing.title}</p>
                    {listing.location && <p className="text-sm text-gray-600 dark:text-gray-300">{listing.location}</p>}
                    <Link
                      href={`/opportunity/listing/${listing.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 mt-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t("adminOpportunity.viewListing")}
                    </Link>
                    {listing.rejectionReason && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t("marketplace.rejectionReasonLabel")}: {listing.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {listing.status === "PENDING_REVIEW" && (
                      <>
                        <button
                          onClick={() => runAction(listing.id, "approve")}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t("adminMarketplace.approve")}
                        </button>
                        <button
                          onClick={() => openRejectModal(listing.id, "reject")}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        >
                          <XCircle className="w-4 h-4" />
                          {t("adminMarketplace.reject")}
                        </button>
                      </>
                    )}
                    {listing.status === "ACTIVE" && (
                      <button
                        onClick={() => openRejectModal(listing.id, "remove")}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      >
                        <ShieldOff className="w-4 h-4" />
                        {t("adminMarketplace.remove")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("adminReports.previous")}
          </button>
          <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">{t("adminReports.pageOf", { page, total: totalPages })}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("adminReports.next")}
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button onClick={() => setModalOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {modalAction === "reject" ? t("adminMarketplace.reject") : t("adminMarketplace.remove")}
            </h2>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("adminReports.noteOptional")}</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-zrp-red focus:border-transparent"
              placeholder={t("adminReports.notePlaceholder")}
            />
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                {t("adminReports.cancel")}
              </button>
              <button onClick={submitModal} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                {t("adminReports.confirmAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
