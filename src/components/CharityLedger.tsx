"use client";

import { useEffect, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface CharityData {
  generatedAt: string;
  committed: { amount: number; currency: string };
  disbursed: {
    total: number;
    byCause: Record<string, number>;
    records: {
      id: string;
      beneficiaryName: string;
      cause: string;
      amount: number;
      currency: string;
      disbursedAt: string;
      note: string | null;
      proofUrl: string | null;
    }[];
  };
}

const CAUSE_LABEL_KEYS: Record<string, TranslationKey> = {
  orphanages: "charity.orphanagesLabel",
  schools: "charity.schoolsLabel",
  hospitals: "charity.hospitalsLabel",
  climate: "charity.climateProjectsLabel",
};

export default function CharityLedger() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<CharityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const localeMap: Record<string, string> = {
    en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES",
    ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID", sq: "sq-AL",
  };
  const locale = localeMap[language] || "en-US";

  useEffect(() => {
    fetch("/api/transparency/charity")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const formatMoney = (amount: number, currency: string) =>
    `${amount.toLocaleString(locale, { maximumFractionDigits: 2 })} ${currency}`;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-zrp-red animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-center text-zrp-charcoal/60 dark:text-white/60 font-inter py-12">
        {t("charity.errLoad")}
      </p>
    );
  }

  return (
    <>
      {/* Committed vs. disbursed - two genuinely different numbers, kept separate */}
      <div className="grid md:grid-cols-2 gap-6 text-center">
        <div className="bg-zrp-silver/20 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
          <div className="text-3xl sm:text-4xl font-bold text-zrp-red font-orbitron">
            {formatMoney(data.committed.amount, data.committed.currency)}
          </div>
          <p className="text-zrp-charcoal/70 dark:text-white/70 mt-2 font-inter font-medium">
            {t("charity.committedLabel")}
          </p>
          <p className="text-xs text-zrp-charcoal/50 dark:text-white/50 mt-1 font-inter">
            {t("charity.committedNote")}
          </p>
        </div>
        <div className="bg-zrp-silver/20 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
          <div className="text-3xl sm:text-4xl font-bold text-zrp-red font-orbitron">
            {formatMoney(data.disbursed.total, "USD")}
          </div>
          <p className="text-zrp-charcoal/70 dark:text-white/70 mt-2 font-inter font-medium">
            {t("charity.disbursedLabel")}
          </p>
          <p className="text-xs text-zrp-charcoal/50 dark:text-white/50 mt-1 font-inter">
            {t("charity.disbursedNote")}
          </p>
        </div>
      </div>

      {/* Cause breakdown - real disbursed amounts */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {Object.entries(data.disbursed.byCause).map(([cause, amount]) => (
          <div
            key={cause}
            className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
          >
            <p className="text-xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
              {formatMoney(amount, "USD")}
            </p>
            <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 font-inter">
              {t(CAUSE_LABEL_KEYS[cause])}
            </p>
          </div>
        ))}
      </div>

      {/* Disbursement ledger - real, verifiable records */}
      <div className="mt-12">
        <h3 className="text-xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-6">
          {t("charity.ledgerHeading")}
        </h3>

        {data.disbursed.records.length === 0 ? (
          <p className="text-center text-zrp-charcoal/60 dark:text-white/60 font-inter max-w-xl mx-auto">
            {t("charity.noDisbursementsYet")}
          </p>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {data.disbursed.records.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white dark:bg-zrp-charcoal/50 p-4 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <div>
                  <p className="font-semibold text-zrp-charcoal dark:text-white font-inter">
                    {r.beneficiaryName}
                  </p>
                  <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 font-inter">
                    {t(CAUSE_LABEL_KEYS[r.cause] ?? "charity.orphanagesLabel")} ·{" "}
                    {new Date(r.disbursedAt).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  {r.note && (
                    <p className="text-sm text-zrp-charcoal/50 dark:text-white/50 font-inter mt-1">
                      {r.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-bold text-zrp-red font-orbitron">
                    {formatMoney(r.amount, r.currency)}
                  </span>
                  {r.proofUrl && (
                    <a
                      href={r.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-zrp-red hover:underline"
                    >
                      {t("charity.viewProof")}
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-zrp-charcoal/50 dark:text-white/50 text-sm border-t border-zrp-silver/30 dark:border-zrp-charcoal pt-6 font-inter">
        {t("transparency.generatedNote", {
          date: new Date(data.generatedAt).toLocaleString(locale),
        })}
      </div>
    </>
  );
}
