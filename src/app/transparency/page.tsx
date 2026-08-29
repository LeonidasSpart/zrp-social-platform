"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Clock,
  Flag,
  CheckCircle2,
  Loader2,
  Info,
  Scale,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface ModerationData {
  generatedAt: string;
  totals: { allTime: number; last30Days: number; last90Days: number };
  byReason: { reason: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byActionType: { actionType: string; count: number }[];
  medianResolutionHours: number | null;
  series: { month: string; received: number; actioned: number }[];
  appeals: { pending: number; upheld: number; overturned: number };
}

const REASON_KEYS: Record<string, TranslationKey> = {
  "Spam": "transparency.reasonSpam",
  "Harassment or bullying": "transparency.reasonHarassment",
  "Inappropriate content": "transparency.reasonInappropriate",
  "Misinformation": "transparency.reasonMisinformation",
  "Hate speech": "transparency.reasonHateSpeech",
  "Impersonation": "transparency.reasonImpersonation",
  "Other": "transparency.reasonOther",
};

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "adminReports.statusPending",
  reviewed: "adminReports.statusReviewed",
  dismissed: "adminReports.statusDismissed",
  actioned: "adminReports.statusActioned",
};

const ACTION_KEYS: Record<string, TranslationKey> = {
  DELETE_POST: "adminReports.actionDeletePost",
  WARN_USER: "adminReports.actionWarnUser",
  BAN_USER: "adminReports.actionBanUser",
  MUTE_USER: "adminReports.actionMuteUser",
  DELETE_COMMENT: "adminReports.actionDeleteComment",
  OTHER: "adminReports.actionOther",
};

function formatMonth(month: string, locale: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(locale, {
    month: "short",
    year: "2-digit",
  });
}

export default function TransparencyPage() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<ModerationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const localeMap: Record<string, string> = {
    en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES",
    ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID", sq: "sq-AL",
  };
  const locale = localeMap[language] || "en-US";

  useEffect(() => {
    fetch("/api/transparency/moderation")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const maxReasonCount = data ? Math.max(1, ...data.byReason.map((r) => r.count)) : 1;
  const maxActionCount = data ? Math.max(1, ...data.byActionType.map((a) => a.count)) : 1;
  const seriesData = data?.series.map((s) => ({ ...s, label: formatMonth(s.month, locale) })) ?? [];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>
        {/* Hero */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <ShieldCheck className="w-12 h-12 text-white/90 mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("transparency.heroTitle")}
            </h1>
            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              {t("transparency.heroSubtitle")}
            </p>
          </div>
        </section>

        {/* What this is / isn't */}
        <section className="py-12 px-4 max-w-4xl mx-auto">
          <div className="flex items-start gap-3 bg-zrp-silver/10 dark:bg-zrp-charcoal/30 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-xl p-5">
            <Info className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 font-inter">
              {t("transparency.privacyNote")}
            </p>
          </div>
        </section>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-zrp-red animate-spin" aria-hidden="true" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-20 text-zrp-charcoal/60 dark:text-white/60 font-inter">
            {t("transparency.errLoad")}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Headline stats */}
            <section className="px-4 max-w-6xl mx-auto">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <Flag className="w-6 h-6 text-zrp-red mx-auto mb-2" aria-hidden="true" />
                  <div className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.totals.allTime.toLocaleString(locale)}
                  </div>
                  <p className="text-zrp-charcoal/70 dark:text-white/70 mt-1 text-sm font-inter">
                    {t("transparency.totalReportsLabel")}
                  </p>
                </div>
                <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <Clock className="w-6 h-6 text-zrp-red mx-auto mb-2" aria-hidden="true" />
                  <div className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.totals.last30Days.toLocaleString(locale)}
                  </div>
                  <p className="text-zrp-charcoal/70 dark:text-white/70 mt-1 text-sm font-inter">
                    {t("transparency.last30DaysLabel")}
                  </p>
                </div>
                <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <CheckCircle2 className="w-6 h-6 text-zrp-red mx-auto mb-2" aria-hidden="true" />
                  <div className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.byStatus.find((s) => s.status === "actioned")?.count.toLocaleString(locale) ?? 0}
                  </div>
                  <p className="text-zrp-charcoal/70 dark:text-white/70 mt-1 text-sm font-inter">
                    {t("transparency.actionsTakenLabel")}
                  </p>
                </div>
                <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <Clock className="w-6 h-6 text-zrp-red mx-auto mb-2" aria-hidden="true" />
                  <div className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.medianResolutionHours === null
                      ? "—"
                      : data.medianResolutionHours < 24
                      ? t("transparency.hoursValue", { n: Math.round(data.medianResolutionHours) })
                      : t("transparency.daysValue", { n: Math.round(data.medianResolutionHours / 24) })}
                  </div>
                  <p className="text-zrp-charcoal/70 dark:text-white/70 mt-1 text-sm font-inter">
                    {t("transparency.medianResolutionLabel")}
                  </p>
                </div>
              </div>
            </section>

            {/* Trend */}
            <section className="py-16 px-4 max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-8">
                {t("transparency.trendHeading")}
              </h2>
              <div className="bg-white dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="received" stroke="#9CA3AF" name={t("transparency.reportsReceivedLegend")} />
                    <Line type="monotone" dataKey="actioned" stroke="#FF2D2D" name={t("transparency.reportsActionedLegend")} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Reason breakdown */}
            <section className="py-8 px-4 max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-8">
                {t("transparency.reasonHeading")}
              </h2>
              <div className="space-y-3">
                {data.byReason.map((r) => (
                  <div key={r.reason} className="flex items-center gap-4">
                    <span className="w-40 flex-shrink-0 text-sm text-zrp-charcoal/80 dark:text-white/70 font-inter">
                      {t(REASON_KEYS[r.reason] ?? "transparency.reasonOther")}
                    </span>
                    <div className="flex-1 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-full h-3">
                      <div
                        className="bg-zrp-red h-3 rounded-full"
                        style={{ width: `${(r.count / maxReasonCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold text-zrp-charcoal dark:text-white font-mono">
                      {r.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Status + action breakdown */}
            <section className="py-16 px-4 max-w-6xl mx-auto grid md:grid-cols-2 gap-10">
              <div>
                <h2 className="text-xl font-bold text-zrp-charcoal dark:text-white font-orbitron mb-6">
                  {t("transparency.statusHeading")}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {data.byStatus.map((s) => (
                    <div
                      key={s.status}
                      className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal text-center"
                    >
                      <p className="text-2xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                        {s.count}
                      </p>
                      <p className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter mt-1">
                        {t(STATUS_KEYS[s.status])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-zrp-charcoal dark:text-white font-orbitron mb-6">
                  {t("transparency.actionHeading")}
                </h2>
                <div className="bg-white dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.byActionType} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} domain={[0, maxActionCount]} />
                      <YAxis
                        type="category"
                        dataKey="actionType"
                        tick={{ fontSize: 11 }}
                        width={100}
                        tickFormatter={(v: string) => t(ACTION_KEYS[v])}
                      />
                      <Tooltip formatter={(value) => [value, t("transparency.actionHeading")]} labelFormatter={(v) => t(ACTION_KEYS[v as string])} />
                      <Bar dataKey="count" fill="#FF2D2D" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Appeals */}
            <section className="py-8 px-4 max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-2">
                {t("transparency.appealsHeading")}
              </h2>
              <p className="text-center text-sm text-zrp-charcoal/60 dark:text-white/60 font-inter mb-8 max-w-2xl mx-auto">
                {t("transparency.appealsNote")}
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
                  <Scale className="w-5 h-5 text-zrp-red mx-auto mb-1" aria-hidden="true" />
                  <p className="text-2xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.appeals.pending.toLocaleString(locale)}
                  </p>
                  <p className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter mt-1">
                    {t("appeals.statusPending")}
                  </p>
                </div>
                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
                  <Scale className="w-5 h-5 text-zrp-red mx-auto mb-1" aria-hidden="true" />
                  <p className="text-2xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.appeals.upheld.toLocaleString(locale)}
                  </p>
                  <p className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter mt-1">
                    {t("appeals.statusUpheld")}
                  </p>
                </div>
                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
                  <Scale className="w-5 h-5 text-zrp-red mx-auto mb-1" aria-hidden="true" />
                  <p className="text-2xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                    {data.appeals.overturned.toLocaleString(locale)}
                  </p>
                  <p className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter mt-1">
                    {t("appeals.statusOverturned")}
                  </p>
                </div>
              </div>
            </section>

            <p className="text-center text-xs text-zrp-charcoal/50 dark:text-white/50 pb-16 px-4 font-inter">
              {t("transparency.generatedNote", {
                date: new Date(data.generatedAt).toLocaleString(locale),
              })}
            </p>
          </>
        )}

        {/* CTA */}
        <section className="bg-gradient-to-r from-zrp-darkRed to-zrp-deepBlack py-16 px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h2 className="text-2xl font-bold font-orbitron">{t("transparency.ctaHeading")}</h2>
            <p className="mt-4 text-lg opacity-90 font-inter">{t("transparency.ctaDesc")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/faq"
                className="px-8 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("transparency.ctaFaq")}
              </Link>
              <Link
                href="/privacy"
                className="px-8 py-3 border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                {t("transparency.ctaPrivacy")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
