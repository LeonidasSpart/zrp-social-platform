"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, MapPin, HeartHandshake, Inbox, Flag } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import ContributeModal from "@/components/help/ContributeModal";
import ReportModal from "@/components/ReportModal";
import { CATEGORY_META, NEED_TYPE_META, HELP_NEED_TYPES, formatCampaignAmount, campaignProgress, type HelpCampaignSummary, type HelpNeedType } from "@/lib/help";

interface CampaignDetail extends HelpCampaignSummary {
  organizerId?: string;
  proofUrls: string[];
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function CampaignDetailPage() {
  const { t, language } = useLanguage();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const locale = LOCALE_MAP[language] || "en-US";

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContribute, setShowContribute] = useState(false);
  const [offerType, setOfferType] = useState<HelpNeedType | null>(null);
  const [offerMessage, setOfferMessage] = useState("");
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/help/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => setCampaign(data.campaign))
      .catch(() => setError(t("help.errLoadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const submitReport = async (reason: string, details?: string) => {
    setReportError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: params.id, reason, details }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit report");
      setShowReport(false);
      setReportSent(true);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : t("help.errReportFailed"));
    }
  };

  const submitOffer = async () => {
    if (!offerType || !offerMessage.trim()) return;
    setOfferSubmitting(true);
    setOfferError(null);
    try {
      const res = await fetch(`/api/help/${params.id}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needType: offerType, message: offerMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit offer");
      setOfferSent(true);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : t("help.errOfferFailed"));
    } finally {
      setOfferSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
        <p>{error || t("help.errLoadFailed")}</p>
        <Link href="/aid" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
          {t("help.backToAid")}
        </Link>
      </div>
    );
  }

  const meta = CATEGORY_META[campaign.category];
  const isOwner = session?.user?.id === campaign.organizerId;
  const progress = campaignProgress(campaign.raisedAmount, campaign.goalAmount);
  const needsMoney = campaign.needTypes.includes("MONEY");
  const offerableNeeds = HELP_NEED_TYPES.filter((n) => n !== "MONEY" && campaign.needTypes.includes(n));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/aid" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("help.backToAid")}
      </Link>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {campaign.imageUrls[0] && <img src={campaign.imageUrls[0]} alt={campaign.title} className="w-full aspect-video object-cover" />}

        <div className="p-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zrp-red">
            <meta.icon className="w-4 h-4" />
            {t(meta.labelKey)}
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{campaign.title}</h1>
          {campaign.location && (
            <span className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <MapPin className="w-4 h-4" />
              {campaign.location}
            </span>
          )}

          {needsMoney && campaign.goalAmount && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full bg-zrp-red transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                <span className="font-bold text-gray-900 dark:text-white">{formatCampaignAmount(campaign.raisedAmount, campaign.currency, locale)}</span>{" "}
                {t("help.raisedOf")} {formatCampaignAmount(campaign.goalAmount, campaign.currency, locale)}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 mt-4">
            {campaign.needTypes.map((need) => {
              const needMeta = NEED_TYPE_META[need];
              return (
                <span key={need} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
                  <needMeta.icon className="w-3.5 h-3.5" />
                  {t(needMeta.labelKey)}
                </span>
              );
            })}
          </div>

          <p className="mt-5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{campaign.description}</p>

          {campaign.proofUrls.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t("help.proofLabel")}</p>
              <div className="flex flex-col gap-1">
                {campaign.proofUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-zrp-red hover:underline truncate">
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {campaign.organizer && (
            <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              <img src={campaign.organizer.avatarUrl || "/default-avatar.png"} alt={campaign.organizer.username} className="w-8 h-8 rounded-full object-cover" />
              <Link href={`/profile/${campaign.organizer.username}`} className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition">
                @{campaign.organizer.username}
                <VerifiedBadge badgeType={campaign.organizer.badgeType} />
              </Link>
            </div>
          )}

          {isOwner && (
            <Link
              href={`/aid/campaign/${campaign.id}/offers`}
              className="inline-flex items-center gap-1.5 mt-6 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition self-start"
            >
              <Inbox className="w-4 h-4" />
              {t("help.reviewOffers")}
            </Link>
          )}

          {!isOwner && session?.user && (
            <div className="flex flex-col gap-4 mt-6">
              {needsMoney && (
                <button
                  type="button"
                  onClick={() => setShowContribute(true)}
                  className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition self-start"
                >
                  {t("help.contribute")}
                </button>
              )}

              {offerableNeeds.length > 0 && !offerSent && (
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                    <HeartHandshake className="w-4 h-4" />
                    {t("help.offerHelpTitle")}
                  </p>
                  <div className="flex gap-2 mb-2">
                    {offerableNeeds.map((need) => {
                      const needMeta = NEED_TYPE_META[need];
                      return (
                        <button
                          key={need}
                          type="button"
                          onClick={() => setOfferType(need)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                            offerType === need ? "border-zrp-red bg-zrp-red/10 text-zrp-red" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          <needMeta.icon className="w-3.5 h-3.5" />
                          {t(needMeta.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                  {offerType && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={offerMessage}
                        onChange={(e) => setOfferMessage(e.target.value)}
                        placeholder={t("help.offerMessagePlaceholder")}
                        rows={3}
                        maxLength={1000}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
                      />
                      {offerError && <p className="text-xs text-red-500">{offerError}</p>}
                      <button
                        type="button"
                        disabled={!offerMessage.trim() || offerSubmitting}
                        onClick={submitOffer}
                        className="self-start px-4 py-2 rounded-full bg-zrp-red text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-40"
                      >
                        {offerSubmitting ? t("help.sendingOffer") : t("help.sendOffer")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {offerSent && <p className="text-sm text-green-600 dark:text-green-400">{t("help.offerSent")}</p>}
            </div>
          )}

          {session?.user && !isOwner && (
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              {reportSent ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("help.reportSubmitted")}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-zrp-red transition"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {t("help.reportCampaign")}
                </button>
              )}
              {reportError && <p className="text-xs text-red-500 mt-1">{reportError}</p>}
            </div>
          )}
        </div>
      </div>

      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={submitReport}
      />

      {showContribute && (
        <ContributeModal
          campaignId={campaign.id}
          campaignTitle={campaign.title}
          onClose={() => setShowContribute(false)}
          onContributed={() => {
            setShowContribute(false);
            load();
          }}
        />
      )}
    </div>
  );
}
