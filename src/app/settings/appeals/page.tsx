"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Scale, Send } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface EligibleReport {
  id: string;
  reason: string;
  actionType: string | null;
  actionNote: string | null;
  actionedAt: string | null;
}

interface Appeal {
  id: string;
  message: string;
  status: "pending" | "upheld" | "overturned";
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  report: { id: string; reason: string; actionType: string | null };
}

export default function AppealsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();

  const [eligibleReports, setEligibleReports] = useState<EligibleReport[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/appeals");
      if (res.ok) {
        const data = await res.json();
        setEligibleReports(data.eligibleReports || []);
        setAppeals(data.appeals || []);
      }
    } catch (err) {
      console.error("Error loading appeals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const submitAppeal = async (reportId: string) => {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, message }),
      });
      const data = await res.json();
      if (res.ok) {
        setOpenReportId(null);
        setMessage("");
        load();
      } else {
        setError(data.error || t("appeals.errSubmitFailed"));
      }
    } catch (err) {
      setError(t("appeals.errSubmitFailed"));
    } finally {
      setSubmitting(false);
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

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return t("appeals.statusPending");
      case "overturned": return t("appeals.statusOverturned");
      case "upheld": return t("appeals.statusUpheld");
      default: return s;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 bg-white dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition">
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("appeals.title")}</h1>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("appeals.explanation")}</p>

      {/* ─── Eligible actions ─────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("appeals.eligibleHeading")}</h2>
      {eligibleReports.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">{t("appeals.noEligible")}</p>
      ) : (
        <div className="space-y-3 mb-8">
          {eligibleReports.map((r) => (
            <div key={r.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded uppercase">
                  {actionLabel(r.actionType)}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{r.reason}</span>
              </div>
              {r.actionNote && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{r.actionNote}</p>
              )}
              {r.actionedAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(r.actionedAt).toLocaleString(localeMap[language] || "en-US")}
                </p>
              )}

              {openReportId === r.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder={t("appeals.messagePlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                  />
                  {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitAppeal(r.id)}
                      disabled={submitting || !message.trim()}
                      className="px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition flex items-center gap-1"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t("appeals.submit")}
                    </button>
                    <button
                      onClick={() => { setOpenReportId(null); setMessage(""); setError(null); }}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      {t("adminReports.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setOpenReportId(r.id); setMessage(""); setError(null); }}
                  className="mt-3 px-4 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center gap-1"
                >
                  <Scale className="w-4 h-4" />
                  {t("appeals.fileAppeal")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Filed appeals ────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("appeals.filedHeading")}</h2>
      {appeals.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("appeals.noFiled")}</p>
      ) : (
        <div className="space-y-3">
          {appeals.map((a) => (
            <div key={a.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(a.status)}`}>
                  {statusLabel(a.status).toUpperCase()}
                </span>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded uppercase">
                  {actionLabel(a.report.actionType)}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{a.report.reason}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{a.message}</p>
              {a.resolutionNote && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 border-l-2 border-zrp-red pl-2">
                  {a.resolutionNote}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {new Date(a.createdAt).toLocaleString(localeMap[language] || "en-US")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
