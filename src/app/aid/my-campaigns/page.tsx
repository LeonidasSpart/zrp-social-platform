"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { CATEGORY_META, STATUS_LABEL_KEYS, STATUS_STYLES, formatCampaignAmount, type HelpCampaignSummary } from "@/lib/help";

interface MyCampaign extends HelpCampaignSummary {
  balance: number;
  totalWithdrawn: number;
  status: NonNullable<HelpCampaignSummary["status"]>;
  _count?: { contributions: number; offers: number };
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function MyCampaignsPage() {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language] || "en-US";
  const [campaigns, setCampaigns] = useState<MyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  const load = () => {
    fetch("/api/help/my-campaigns")
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch((err) => console.error("Error loading my campaigns:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const requestWithdrawal = async (campaignId: string) => {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError(t("help.errInvalidAmount"));
      return;
    }
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/help/${campaignId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to request withdrawal");
      setWithdrawSuccess(t("help.withdrawalRequested"));
      setWithdrawId(null);
      setWithdrawAmount("");
      load();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : t("help.errWithdrawFailed"));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/aid" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("help.backToAid")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("help.myCampaigns")}</h1>

      {withdrawSuccess && <p className="text-sm text-green-600 dark:text-green-400 mb-4">{withdrawSuccess}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("help.noOwnCampaigns")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((campaign) => {
            const meta = CATEGORY_META[campaign.category];
            const needsMoney = campaign.needTypes.includes("MONEY");
            return (
              <div key={campaign.id} className="p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zrp-red">
                      <meta.icon className="w-3.5 h-3.5" />
                      {t(meta.labelKey)}
                    </span>
                    <Link href={`/aid/campaign/${campaign.id}`} className="block font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition truncate">
                      {campaign.title}
                    </Link>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${STATUS_STYLES[campaign.status]}`}>
                    {t(STATUS_LABEL_KEYS[campaign.status])}
                  </span>
                </div>

                {campaign.rejectionReason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{campaign.rejectionReason}</p>}

                {needsMoney && (
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("help.raised")}</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{formatCampaignAmount(campaign.raisedAmount, campaign.currency, locale)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("help.availableBalance")}</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{formatCampaignAmount(campaign.balance, campaign.currency, locale)}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{t("help.contributionsCount", { n: campaign._count?.contributions ?? 0 })}</span>
                  <span>{t("help.offersCount", { n: campaign._count?.offers ?? 0 })}</span>
                </div>

                {needsMoney && campaign.status === "ACTIVE" && campaign.balance > 0 && (
                  <div className="mt-3">
                    {withdrawId === campaign.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder={t("help.amountLabel")}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                        />
                        {withdrawError && <p className="text-xs text-red-500">{withdrawError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={withdrawing}
                            onClick={() => requestWithdrawal(campaign.id)}
                            className="px-4 py-1.5 rounded-full bg-zrp-red text-white text-xs font-semibold hover:bg-red-600 transition disabled:opacity-50"
                          >
                            {withdrawing ? t("help.requesting") : t("help.confirmWithdrawal")}
                          </button>
                          <button type="button" onClick={() => setWithdrawId(null)} className="px-4 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            {t("help.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawId(campaign.id);
                          setWithdrawError(null);
                        }}
                        className="text-xs font-semibold text-zrp-red hover:underline"
                      >
                        {t("help.requestWithdrawal")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
