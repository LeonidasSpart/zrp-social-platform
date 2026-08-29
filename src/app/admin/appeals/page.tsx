"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Scale, Clock, CheckCircle, XCircle, Filter, X, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Appeal {
  id: string;
  message: string;
  status: "pending" | "upheld" | "overturned";
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  user: { id: string; username: string; name: string | null };
  report: {
    id: string;
    reason: string;
    actionType: string | null;
    actionNote: string | null;
    actionedAt: string | null;
  };
}

export default function AdminAppeals() {
  const { t, language } = useLanguage();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"upheld" | "overturned">("upheld");
  const [resolutionNote, setResolutionNote] = useState("");

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/appeals?status=${statusFilter}&page=${page}`);
      const data = await res.json();
      setAppeals(data.appeals || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching appeals:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppeals();
  }, [page, statusFilter]);

  const openModal = (id: string) => {
    setSelectedId(id);
    setDecision("upheld");
    setResolutionNote("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedId(null);
  };

  const submitDecision = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/appeals/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision, resolutionNote }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: t("adminAppeals.resolved") });
        fetchAppeals();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || t("adminReports.errUpdateFailed") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("adminReports.errSomethingWrong") });
    } finally {
      closeModal();
    }
  };

  const actionLabel = (actionType: string | null) =>
    actionType ? actionType.replace(/_/g, " ") : t("adminReports.actionOther");

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "overturned": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "upheld": return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-800";
    }
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminAppeals.title")}</h1>
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          >
            <option value="all">{t("adminReports.all")}</option>
            <option value="pending">{t("appeals.statusPending")}</option>
            <option value="upheld">{t("appeals.statusUpheld")}</option>
            <option value="overturned">{t("appeals.statusOverturned")}</option>
          </select>
        </div>
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
        {appeals.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t("adminAppeals.noAppeals")}</div>
        ) : (
          appeals.map((appeal) => (
            <div
              key={appeal.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(appeal.status)}`}>
                      {appeal.status.toUpperCase()}
                    </span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {actionLabel(appeal.report.actionType)}
                    </span>
                    <Link
                      href={`/profile/${appeal.user.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                      @{appeal.user.username}
                    </Link>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {appeal.report.reason}
                  </p>
                  <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4 border-zrp-red">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{appeal.message}</p>
                  </div>
                  {appeal.resolutionNote && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      {appeal.resolutionNote}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(appeal.createdAt).toLocaleString(localeMap[language] || "en-US")}
                  </p>
                </div>
                {appeal.status === "pending" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => openModal(appeal.id)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-1"
                    >
                      <Scale className="w-4 h-4" />
                      {t("adminAppeals.resolve")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
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
          <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
            {t("adminReports.pageOf", { page, total: totalPages })}
          </span>
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
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t("adminAppeals.chooseDecision")}</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={() => setDecision("upheld")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition ${
                    decision === "upheld"
                      ? "bg-gray-800 text-white border-gray-800 dark:bg-gray-600 dark:border-gray-600"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  {t("appeals.statusUpheld")}
                </button>
                <button
                  onClick={() => setDecision("overturned")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition ${
                    decision === "overturned"
                      ? "bg-green-600 text-white border-green-600"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  {t("appeals.statusOverturned")}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("adminReports.noteOptional")}
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                  placeholder={t("adminReports.notePlaceholder")}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {t("adminReports.cancel")}
              </button>
              <button
                onClick={submitDecision}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                {t("adminReports.confirmAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
