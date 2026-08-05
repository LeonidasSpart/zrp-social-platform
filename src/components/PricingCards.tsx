"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, X, Crown, Building2, Briefcase } from "lucide-react";
import { PLANS, PlanLimits } from "@/lib/limits";
import UpgradeRequestModal from "./UpgradeRequestModal";

interface PricingCardProps {
  plan: string;
  limits: PlanLimits;
  isCurrent: boolean;
}

function PricingCard({ plan, limits, isCurrent }: PricingCardProps) {
  const [showModal, setShowModal] = useState(false);
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  // ─── Handle price safely ──────────────────────────────────────────
  const price = limits.priceMonthly;
  let displayPrice = "Free";
  if (price !== null && price !== 0) {
    displayPrice = `CHF ${price.toFixed(2)} / month`;
  }

  const features = [
    { label: `Posts up to ${limits.postLength === 999999 ? 'Unlimited' : limits.postLength} characters`, included: true },
    { label: `${limits.imagesPerPost === 999999 ? 'Unlimited' : limits.imagesPerPost} images per post`, included: true },
    { label: `Video upload up to ${limits.videoUploadMB}MB`, included: true },
    { label: `${limits.scheduledPostsPerMonth === 999999 ? 'Unlimited' : limits.scheduledPostsPerMonth} scheduled posts/month`, included: true },
    { label: `${limits.analytics.charAt(0).toUpperCase() + limits.analytics.slice(1)} analytics`, included: true },
    { label: `Verified badge`, included: limits.verifiedBadge },
    { label: `Custom profile URL`, included: limits.customProfileUrl },
    { label: `Recruitment profiles`, included: limits.recruitmentProfiles },
    { label: `Article publishing`, included: limits.articlePublishing },
    { label: `Team management`, included: limits.teamManagement },
    { label: `API access`, included: limits.apiAccess },
    { label: `Support: ${limits.prioritySupport}`, included: true },
    { label: `${limits.charityContribution}% to charity`, included: true },
  ];

  const iconMap: Record<string, any> = {
    free: null,
    pro: Crown,
    business: Briefcase,
    enterprise: Building2,
  };
  const Icon = iconMap[plan];

  const getPlanColor = () => {
    if (plan === 'free') return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    if (plan === 'pro') return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    if (plan === 'business') return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  };

  return (
    <>
      <div className={`rounded-xl shadow-sm border p-6 ${getPlanColor()}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{planLabel}</h3>
          {Icon && <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {displayPrice}
          {price !== null && price !== 0 && <span className="text-sm font-normal text-gray-500 ml-1">/ month</span>}
        </div>
        {price !== null && price !== 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Billed monthly. 35% to charity.
          </p>
        )}
        <ul className="space-y-2 text-sm mt-4">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              {f.included ? (
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span>{f.label}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={() => {
            if (isCurrent) return;
            if (plan === 'free') return;
            setShowModal(true);
          }}
          disabled={isCurrent || plan === 'free'}
          className={`w-full mt-4 py-2 rounded-lg font-medium transition ${
            isCurrent
              ? 'bg-gray-500 text-white cursor-default'
              : 'bg-zrp-red text-white hover:bg-zrp-darkRed'
          }`}
        >
          {isCurrent ? 'Current Plan' : `Upgrade to ${planLabel}`}
        </button>
      </div>

      {showModal && (
        <UpgradeRequestModal
          plan={plan}
          limits={limits}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}

export default function PricingCards() {
  const { data: session, update } = useSession();
  const currentPlan = session?.user?.plan || 'free';

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Choose Your Plan</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          All plans contribute 35% of profits to charity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(PLANS).map(([key, limits]) => (
          <PricingCard
            key={key}
            plan={key}
            limits={limits}
            isCurrent={currentPlan === key}
          />
        ))}
      </div>
    </div>
  );
}
