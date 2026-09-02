"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { HeartHandshake, Plus, LayoutList } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import CampaignCard from "@/components/help/CampaignCard";
import { HELP_CATEGORIES, CATEGORY_META, type HelpCampaignSummary } from "@/lib/help";

export default function AidHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [campaigns, setCampaigns] = useState<HelpCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    fetch(`/api/help?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch((err) => console.error("Error loading HELP campaigns:", err))
      .finally(() => setLoading(false));
  }, [category]);

  const isVerifiedOrganizer = session?.user?.badgeType === "organization";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-10 text-center mb-8">
        <div className="flex items-center justify-center gap-2">
          <HeartHandshake className="w-8 h-8 text-white" />
          <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">{t("help.heroTitle")}</h1>
        </div>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("help.heroSubtitle")}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && isVerifiedOrganizer && (
            <Link
              href="/aid/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("help.createCampaign")}
            </Link>
          )}
          {session?.user && (
            <Link
              href="/aid/my-campaigns"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
            >
              <LayoutList className="w-4 h-4" />
              {t("help.myCampaigns")}
            </Link>
          )}
        </div>
        {session?.user && !isVerifiedOrganizer && (
          <p className="mt-4 text-xs text-white/60 max-w-md mx-auto">{t("help.orgOnlyNote")}</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setCategory("")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
            category === "" ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          {t("help.allCategories")}
        </button>
        {HELP_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              category === cat ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
            }`}
          >
            {t(CATEGORY_META[cat].labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("help.noCampaignsYet")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
