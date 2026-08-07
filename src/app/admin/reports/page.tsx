"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Flag, Clock, CheckCircle, AlertTriangle, Filter, X, ExternalLink, User } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: "pending" | "reviewed" | "dismissed" | "actioned";
  actionType: string | null;
  actionNote: string | null;
  actionedAt: string | null;
  createdAt: string;
  reporter: { username: string; name: string };
  post: { id: string; content: string; author: { username: string } } | null;
  comment: { id: string; content: string; author: { username: string } } | null;
}

export default function AdminReports() {
  const { t, language } = useLanguage();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  const ACTION_TYPES = [
    { value: "DELETE_POST", label: t("adminReports.actionDeletePost") },
    { value: "WARN_USER", label: t("adminReports.actionWarnUser") },
    { value: "BAN_USER", label: t("adminReports.actionBanUser") },
    { value: "MUTE_USER", label: t("adminReports.actionMuteUser") },
    { value: "DELETE_COMMENT", label: t("adminReports.actionDeleteComment") },
    { value: "OTHER", label: t("adminReports.actionOther") },
  ];

  const statusLabel: Record<string, string> = {
    pending: t("adminReports.statusPending"),
    reviewed: t("adminReports.statusReviewed"),
    dismissed: t("adminReports.statusDismissed"),
    actioned: t("adminReports.statusActioned"),
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [actionType, setActionType] = useState(ACTION_TYPES[0].value);
  const [actionNote, setActionNote] = useState("");

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${statusFilter}&page=${page}`);
      const data = await res.json();
      setReports(data.reports || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter]);

  const updateStatus = async (reportId: string, newStatus: string, extraData = {}) => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extraData }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: t("adminReports.reportUpdated", { status: statusLabel[newStatus] || newStatus }) });
        fetchReports();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: t("adminReports.errUpdateFailed") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("adminReports.errSomethingWrong") });
    }
  };

  const openActionModal = (reportId: string) => {
    setSelectedReportId(reportId);
    setActionType(ACTION_TYPES[0].value);
    setActionNote("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedReportId(null);
  };

  const handleActionSubmit = async () => {
    if (!selectedReportId) return;
    if (!actionType) {
      setMessage({ type: "error", text: t("adminReports.errSelectActionType") });
      return;
    }
    await updateStatus(selectedReportId, "actioned", { actionType, actionNote });
    closeModal();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "reviewed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "dismissed": return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      case "actioned": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === "pending").length,
    reviewed: reports.filter(r => r.status === "reviewed").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
    actioned: reports.filter(r => r.status === "actioned").length,
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminReports.title")}</h1>
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          >
            <option value="all">{t("adminReports.all")}</option>
            <option value="pending">{t("adminReports.statusPending")}</option>
            <option value="reviewed">{t("adminReports.statusReviewed")}</option>
            <option value="dismissed">{t("adminReports.statusDismissed")}</option>
            <option value="actioned">{t("adminReports.statusActioned")}</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Flag className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminReports.total")}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminReports.pending")}</p>
            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminReports.reviewed")}</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.reviewed}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminReports.dismissed")}</p>
            <p className="text-lg font-bold text-gray-600 dark:text-gray-400">{stats.dismissed}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminReports.actioned")}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{stats.actioned}</p>
          </div>
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

      {/* Report List */}
      <div className="space-y-3">
        {reports.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t("adminReports.noReports")}</div>
        ) : (
          reports.map((report) => {
            const content = report.post || report.comment;
            const author = content?.author;
            const viewPostLink = report.post ? `/post/${report.post.id}` : null;
            const viewAuthorLink = author ? `/profile/${author.username}` : null;
            const contentLabel = report.post ? t("adminReports.viewPost") : t("adminReports.viewComment");

            return (
              <div
                key={report.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{report.reason}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(report.status)}`}>
                        {(statusLabel[report.status] || report.status).toUpperCase()}
                      </span>
                      {report.actionType && (
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                          {report.actionType.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {t("adminReports.reportedBy", { username: report.reporter.username })}
                    </p>

                    {/* Content preview + navigation links */}
                    {content && (
                      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-l-4 border-zrp-red">
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                          {content.content}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          {viewPostLink && (
                            <Link
                              href={viewPostLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {contentLabel}
                            </Link>
                          )}
                          {viewAuthorLink && (
                            <Link
                              href={viewAuthorLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition"
                            >
                              <User className="w-3 h-3" />
                              {t("adminReports.viewAuthor")}
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {report.details && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        {t("adminReports.details", { details: report.details })}
                      </p>
                    )}
                    {report.actionNote && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        {t("adminReports.note", { note: report.actionNote })}
                      </p>
                    )}
                    {report.actionedAt && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t("adminReports.actionedOn", { date: new Date(report.actionedAt).toLocaleString(localeMap[language] || "en-US") })}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {new Date(report.createdAt).toLocaleString(localeMap[language] || "en-US")}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {report.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateStatus(report.id, "dismissed")}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                        >
                          {t("adminReports.dismiss")}
                        </button>
                        <button
                          onClick={() => updateStatus(report.id, "reviewed")}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          {t("adminReports.review")}
                        </button>
                        <button
                          onClick={() => openActionModal(report.id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        >
                          {t("adminReports.action")}
                        </button>
                      </>
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
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("adminReports.previous")}
          </button>
          <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
            {t("adminReports.pageOf", { page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("adminReports.next")}
          </button>
        </div>
      )}

      {/* ─── Modal ────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t("adminReports.chooseAction")}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("adminReports.actionType")}
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                >
                  {ACTION_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("adminReports.noteOptional")}
                </label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
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
                onClick={handleActionSubmit}
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
