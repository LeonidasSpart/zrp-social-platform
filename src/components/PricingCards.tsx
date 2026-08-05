"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PLANS } from "@/lib/limits";
import { Check, X, Copy } from "lucide-react";
import CryptoPaymentModal from "./CryptoPaymentModal";

interface PricingCardProps {
  plan: string;
  limits: any;
  isCurrent: boolean;
  isAdmin: boolean;
  onUpgrade: (plan: string) => void;
}

function PricingCard({ plan, limits, isCurrent, isAdmin, onUpgrade }: PricingCardProps) {
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  const features = [
    `Posts up to ${limits.postLength === 999999 ? "Unlimited" : limits.postLength} characters`,
    `${limits.imagesPerPost === 999999 ? "Unlimited" : limits.imagesPerPost} images per post`,
    `Video upload up to ${limits.videoUploadMB}MB`,
    `${limits.scheduledPostsPerMonth === 999999 ? "Unlimited" : limits.scheduledPostsPerMonth} scheduled posts/month`,
    `${limits.analytics.charAt(0).toUpperCase() + limits.analytics.slice(1)} analytics`,
    limits.verifiedBadge ? "✅ Verified badge" : "❌ No verified badge",
    limits.customProfileUrl ? "✅ Custom profile URL" : "❌ No custom URL",
    limits.recruitmentProfiles ? "✅ Recruitment profiles" : "❌ No recruitment",
    limits.articlePublishing ? "✅ Article publishing" : "❌ No articles",
    limits.teamManagement ? "✅ Team management" : "❌ No team management",
    limits.apiAccess ? "✅ API access" : "❌ No API",
    `Support: ${limits.prioritySupport}`,
    `${limits.charityContribution}% to charity`,
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
        {plan !== "free" && <span className="text-sm font-normal text-gray-500"> / month</span>}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
            <span className="flex-shrink-0 mt-0.5">
              {feat.includes("✅") ? "✅" : feat.includes("❌") ? "❌" : "•"}
            </span>
            <span>{feat.replace(/[✅❌]\s*/, "")}</span>
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
          {isCurrent ? "Current Plan" : `Upgrade to ${planLabel}`}
        </button>
      ) : (
        <div className="mt-4 space-y-2">
          {isCurrent ? (
            <div className="w-full text-center py-2 text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg">
              Current Plan
            </div>
          ) : plan !== "free" ? (
            <>
              <button
                onClick={() => setShowCryptoModal(true)}
                className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed transition"
              >
                Subscribe with Crypto
              </button>
              <p className="text-xs text-gray-400 text-center">Pay with USDC (Solana)</p>
            </>
          ) : (
            <button
              onClick={() => onUpgrade(plan)}
              className="w-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-not-allowed opacity-50"
              disabled
            >
              Already Free
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
        alert(`Plan upgraded to ${plan}!`);
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to upgrade.");
      }
    } catch {
      alert("Something went wrong.");
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Choose Your Plan</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          All plans contribute 35% of profits to charity.
        </p>
        {!isAdmin && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Subscribe with USDC (Solana). After payment, admins will verify and upgrade your plan.
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
