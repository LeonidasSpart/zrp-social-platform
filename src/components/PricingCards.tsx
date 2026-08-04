"use client";

import { useState } from "react";
import { Check, X, Crown, Building2, Briefcase } from "lucide-react";
import { PLANS, PlanLimits } from "@/lib/limits";

interface PricingCardProps {
  plan: string;
  limits: PlanLimits;
  isCurrent?: boolean;
  onUpgrade?: (plan: string) => void;
}

function PricingCard({ plan, limits, isCurrent, onUpgrade }: PricingCardProps) {
  const features = [
    { label: `Posts up to ${limits.postLength} characters`, included: true },
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

  const getPlanLabel = () => {
    if (plan === 'free') return 'Free';
    if (plan === 'pro') return 'Pro';
    if (plan === 'business') return 'Business';
    return 'Enterprise';
  };

  const getPlanColor = () => {
    if (plan === 'free') return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    if (plan === 'pro') return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    if (plan === 'business') return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  };

  const getButtonStyle = () => {
    if (isCurrent) return 'bg-gray-500 text-white cursor-default';
    if (plan === 'free') return 'bg-zrp-red text-white hover:bg-zrp-darkRed';
    if (plan === 'pro') return 'bg-blue-600 text-white hover:bg-blue-700';
    if (plan === 'business') return 'bg-purple-600 text-white hover:bg-purple-700';
    return 'bg-amber-600 text-white hover:bg-amber-700';
  };

  return (
    <div className={`rounded-xl shadow-sm border p-6 ${getPlanColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{getPlanLabel()}</h3>
        {Icon && <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
      </div>

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
        onClick={() => onUpgrade?.(plan)}
        disabled={isCurrent}
        className={`w-full mt-4 py-2 rounded-lg font-medium transition ${getButtonStyle()}`}
      >
        {isCurrent ? 'Current Plan' : `Upgrade to ${getPlanLabel()}`}
      </button>
    </div>
  );
}

export default function PricingCards() {
  const [currentPlan, setCurrentPlan] = useState('free');

  const handleUpgrade = async (plan: string) => {
    try {
      const res = await fetch('/api/user/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        setCurrentPlan(plan);
        alert(`Successfully upgraded to ${plan}!`);
      } else {
        alert('Upgrade failed. Please try again.');
      }
    } catch (error) {
      alert('Something went wrong.');
    }
  };

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
            onUpgrade={handleUpgrade}
          />
        ))}
      </div>
    </div>
  );
}
