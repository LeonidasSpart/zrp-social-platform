"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { NEED_TYPE_META, OFFER_STATUS_LABEL_KEYS, type HelpNeedType, type HelpOfferStatus } from "@/lib/help";

interface Offer {
  id: string;
  needType: HelpNeedType;
  message: string;
  status: HelpOfferStatus;
  createdAt: string;
  offerer: { id: string; username: string; name: string | null; avatarUrl: string | null; badgeType: string | null };
}

export default function CampaignOffersPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/help/${params.id}/offer`)
      .then((res) => res.json())
      .then((data) => setOffers(data.offers || []))
      .catch((err) => console.error("Error loading HELP offers:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const updateStatus = async (offerId: string, status: HelpOfferStatus) => {
    setBusyId(offerId);
    try {
      await fetch(`/api/help/offers/${offerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      console.error("Error updating offer status:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href={`/aid/campaign/${params.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("help.backToCampaign")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("help.offersReviewTitle")}</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("help.noOffersYet")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {offers.map((offer) => {
            const meta = NEED_TYPE_META[offer.needType];
            return (
              <div key={offer.id} className="p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={offer.offerer.avatarUrl || "/default-avatar.png"} alt={offer.offerer.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    <div className="min-w-0">
                      <Link href={`/profile/${offer.offerer.username}`} className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition truncate">
                        @{offer.offerer.username}
                        <VerifiedBadge badgeType={offer.offerer.badgeType} />
                      </Link>
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                        <meta.icon className="w-3 h-3" />
                        {t(meta.labelKey)}
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {t(OFFER_STATUS_LABEL_KEYS[offer.status])}
                  </span>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 whitespace-pre-line">{offer.message}</p>

                {offer.status === "PENDING" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => updateStatus(offer.id, "ACKNOWLEDGED")}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {t("help.offerStatusAcknowledged")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => updateStatus(offer.id, "FULFILLED")}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {t("help.offerStatusFulfilled")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => updateStatus(offer.id, "DECLINED")}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {t("help.offerStatusDeclined")}
                    </button>
                  </div>
                )}
                {offer.status === "ACKNOWLEDGED" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => updateStatus(offer.id, "FULFILLED")}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {t("help.offerStatusFulfilled")}
                    </button>
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
