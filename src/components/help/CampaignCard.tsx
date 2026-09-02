"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { CATEGORY_META, NEED_TYPE_META, formatCampaignAmount, campaignProgress, type HelpCampaignSummary } from "@/lib/help";

interface CampaignCardProps {
  campaign: HelpCampaignSummary;
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language] || "en-US";
  const meta = CATEGORY_META[campaign.category];
  const coverImage = campaign.imageUrls[0];
  const progress = campaignProgress(campaign.raisedAmount, campaign.goalAmount);
  const needsMoney = campaign.needTypes.includes("MONEY");

  return (
    <Link
      href={`/aid/campaign/${campaign.id}`}
      className="group flex flex-col bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-zrp-red hover:shadow-md transition"
    >
      <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-800">
        {coverImage ? (
          <img src={coverImage} alt={campaign.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <meta.icon className="w-10 h-10" />
          </div>
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold">
          <meta.icon className="w-3 h-3" />
          {t(meta.labelKey)}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">{campaign.title}</h3>
        {campaign.location && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MapPin className="w-3 h-3" />
            {campaign.location}
          </span>
        )}

        {needsMoney && campaign.goalAmount ? (
          <div>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-zrp-red transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatCampaignAmount(campaign.raisedAmount, campaign.currency, locale)} {t("help.raisedOf")}{" "}
              {formatCampaignAmount(campaign.goalAmount, campaign.currency, locale)}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {campaign.needTypes.map((need) => {
            const needMeta = NEED_TYPE_META[need];
            return (
              <span key={need} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                <needMeta.icon className="w-3 h-3" />
                {t(needMeta.labelKey)}
              </span>
            );
          })}
        </div>

        {campaign.organizer && (
          <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
            {t("play.by", { name: campaign.organizer.username })}
            <VerifiedBadge badgeType={campaign.organizer.badgeType} />
          </div>
        )}
      </div>
    </Link>
  );
}
