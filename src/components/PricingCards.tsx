"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PLANS } from "@/lib/limits";
import { Check, X, Copy } from "lucide-react";
import CryptoPaymentModal from "./CryptoPaymentModal";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface PricingCardProps {
  plan: string;
  limits: any;
  isCurrent: boolean;
  isAdmin: boolean;
  onUpgrade: (plan: string) => void;
}

const PLAN_LABEL_KEYS: Record<string, TranslationKey> = {
  free: "pricing.planFree",
  pro: "pricing.planPro",
  business: "pricing.planBusiness",
  enterprise: "pricing.planEnterprise",
};

const ANALYTICS_KEYS: Record<string, TranslationKey> = {
  basic: "pricing.analyticsBasic",
  advanced: "pricing.analyticsAdvanced",
  full: "pricing.analyticsFull",
  custom: "pricing.analyticsCustom",
};

const SUPPORT_KEYS: Record<string, TranslationKey> = {
  none: "pricing.supportNone",
  standard: "pricing.supportStandard",
  priority: "pricing.supportPriority",
  "24/7": "pricing.support247",
};

function PricingCard({ plan, limits, isCurrent, isAdmin, onUpgrade }: PricingCardProps) {
  const { t } = useLanguage();
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const planLabel = t(PLAN_LABEL_KEYS[plan] ?? "pricing.planFree");

  const features: Array<{ icon: "check" | "cross" | "bullet"; text: string }> = [
    {
      icon: "bullet",
      text: t("pricing.featurePostLength", {
        n: limits.postLength === 999999 ? t("pricing.unlimited") : limits.postLength,
      }),
    },
    {
      icon: "bullet",
      text: t("pricing.featureImagesPerPost", {
        n: limits.imagesPerPost === 999999 ? t("pricing.unlimited") : limits.imagesPerPost,
      }),
    },
    { icon: "bullet", text: t("pricing.featureVideoUpload", { n: limits.videoUploadMB }) },
    {
      icon: "bullet",
      text: t("pricing.featureScheduledPosts", {
        n: limits.scheduledPostsPerMonth === 999999 ? t("pricing.unlimited") : limits.scheduledPostsPerMonth,
      }),
    },
    {
      icon: "bullet",
      text: t("pricing.featureAnalytics", { tier: t(ANALYTICS_KEYS[limits.analytics] ?? "pricing.analyticsBasic") }),
    },
    {
      icon: limits.verifiedBadge ? "check" : "cross",
      text: limits.verifiedBadge ? t("pricing.featureVerifiedBadge") : t("pricing.featureNoVerifiedBadge"),
    },
    {
      icon: limits.customProfileUrl ? "check" : "cross",
      text: limits.customProfileUrl ? t("pricing.featureCustomUrl") : t("pricing.featureNoCustomUrl"),
    },
    {
      icon: limits.recruitmentProfiles ? "check" : "cross",
      text: limits.recruitmentProfiles ? t("pricing.featureRecruitment") : t("pricing.featureNoRecruitment"),
    },
    {
      icon: limits.articlePublishing ? "check" : "cross",
      text: limits.articlePublishing ? t("pricing.featureArticles") : t("pricing.featureNoArticles"),
    },
    {
      icon: limits.teamManagement ? "check" : "cross",
      text: limits.teamManagement ? t("pricing.featureTeamManagement") : t("pricing.featureNoTeamManagement"),
    },
    {
      icon: limits.apiAccess ? "check" : "cross",
      text: limits.apiAccess ? t("pricing.featureApiAccess") : t("pricing.featureNoApiAccess"),
    },
    {
      icon: "bullet",
      text: t("pricing.featureSupport", { tier: t(SUPPORT_KEYS[limits.prioritySupport] ?? "pricing.supportNone") }),
    },
    { icon: "bullet", text: t("pricing.featureCharity", { n: limits.charityContribution }) },
  ];

  const getPrice = () => {
    if (plan === "free") return "0";
    if (plan === "pro") return "9.99";
    if (plan === "business") return "49.99";
    return "99.99";
  };

  return (
    <div className={`rounded-xl shadow-sm border p-6 ${
      plan === "free" ? "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700" :
      plan === "pro" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" :
      plan === "business" ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" :
      "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
    }`}>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{planLabel}</h3>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
        {plan === "free" ? "$0" : `$${getPrice()}`}
        {plan !== "free" && <span className="text-sm font-normal text-gray-500"> {t("pricing.perMonth")}</span>}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
            <span className="flex-shrink-0 mt-0.5">
              {feat.icon === "check" ? "✅" : feat.icon === "cross" ? "❌" : "•"}
            </span>
            <span>{feat.text}</span>
          </li>
        ))}
      </ul>

      {isAdmin ? (
        <button
          onClick={() => onUpgrade(plan)}
          disabled={isCurrent}
          className={`w-full mt-4 py-2 rounded-lg font-medium transition ${
            isCurrent
              ? "bg-gray-500 text-white cursor-default"
              : "bg-zrp-red text-white hover:bg-zrp-darkRed"
          }`}
        >
          {isCurrent ? t("pricing.currentPlan") : t("pricing.upgradeTo", { plan: planLabel })}
        </button>
      ) : (
        <div className="mt-4 space-y-2">
          {isCurrent ? (
            <div className="w-full text-center py-2 text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg">
              {t("pricing.currentPlan")}
            </div>
          ) : plan !== "free" ? (
            <>
              <button
                onClick={() => setShowCryptoModal(true)}
                className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed transition"
              >
                {t("pricing.subscribeWithCrypto")}
              </button>
              <p className="text-xs text-gray-400 text-center">{t("pricing.payWithUsdc")}</p>
            </>
          ) : (
            <button
              onClick={() => onUpgrade(plan)}
              className="w-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-not-allowed opacity-50"
              disabled
            >
              {t("pricing.alreadyFree")}
            </button>
          )}
        </div>
      )}

      {showCryptoModal && (
        <CryptoPaymentModal
          plan={plan}
          amount={parseFloat(getPrice())}
          onClose={() => setShowCryptoModal(false)}
          onSuccess={() => {
            setShowCryptoModal(false);
            // Optionally refresh the session or show a success message
          }}
        />
      )}
    </div>
  );
}

export default function PricingCards() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const isAdmin = session?.user?.role === "ADMIN";

  // For non‑admins, we show the crypto modal; for admins, we just call the upgrade API
  const handleUpgrade = async (plan: string) => {
    // Only admins can directly upgrade (the API enforces it)
    try {
      const res = await fetch("/api/user/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        alert(t("pricing.upgradeSuccessAlert", { plan }));
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || t("pricing.upgradeFailedAlert"));
      }
    } catch {
      alert(t("pricing.somethingWentWrongAlert"));
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t("pricing.chooseYourPlan")}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          {t("pricing.charityTagline")}
        </p>
        {!isAdmin && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              {t("pricing.cryptoNotice")}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(PLANS).map(([key, limits]) => {
          const isCurrent = session?.user?.plan === key;
          return (
            <PricingCard
              key={key}
              plan={key}
              limits={limits}
              isCurrent={isCurrent}
              isAdmin={isAdmin || false}
              onUpgrade={handleUpgrade}
            />
          );
        })}
      </div>
    </div>
  );
}
