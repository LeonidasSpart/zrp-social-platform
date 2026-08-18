"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Calendar,
  Users,
  FileText,
  Lock,
  Loader2,
  Info,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";

interface TrustSignal {
  key: string;
  title: string;
  description: string;
  verified: boolean;
  category: string;
}

interface TrustData {
  passport: {
    score: number;
    level: "LOW" | "MODERATE" | "GOOD" | "HIGH" | "EXCELLENT";
    levelLabel: string;
    generatedAt: string;
  };

  user: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
    createdAt: string;
    accountAgeDays: number;
    accountAgeMonths: number;
    isPrivate: boolean;
    plan: string | null;
  };

  signals: TrustSignal[];

  counts: {
    posts: number;
    followers: number;
    following: number;
  };
}

function getLevelDescription(
  level: TrustData["passport"]["level"]
) {
  switch (level) {
    case "EXCELLENT":
      return "This account has a strong collection of positive ZRP trust signals.";
    case "HIGH":
      return "This account has a strong history of positive ZRP trust signals.";
    case "GOOD":
      return "This account has established several positive trust signals.";
    case "MODERATE":
      return "This account is building a history on ZRP.";
    default:
      return "This account is still building its ZRP trust history.";
  }
}

function getScoreTextClass(score: number) {
  if (score >= 90) return "text-zrp-red";
  if (score >= 75) return "text-zrp-red";
  if (score >= 55) return "text-zrp-red";
  return "text-gray-600 dark:text-gray-300";
}

export default function TrustPassportPage({
  params,
}: {
  params: { username: string };
}) {
  const [data, setData] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadTrustPassport = async () => {
      try {
        setLoading(true);

        const res = await fetch(
          `/api/users/${encodeURIComponent(params.username)}/trust`
        );

        if (!res.ok) {
          throw new Error("Trust Passport unavailable");
        }

        const result = await res.json();
        setData(result);
      } catch (err) {
        console.error(err);
        setError("Unable to load this Trust Passport.");
      } finally {
        setLoading(false);
      }
    };

    loadTrustPassport();
  }, [params.username]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zrp-deepBlack">
        <Loader2 className="w-7 h-7 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white dark:bg-zrp-deepBlack flex flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="w-14 h-14 text-gray-400 mb-4" />

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Trust Passport unavailable
        </h1>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {error || "This account could not be found."}
        </p>

        <Link
          href={`/profile/${params.username}`}
          className="mt-6 px-5 py-2 rounded-full bg-zrp-red text-white text-sm font-medium hover:bg-zrp-darkRed transition"
        >
          Back to profile
        </Link>
      </div>
    );
  }

  const score = data.passport.score;

  const categories = [
    "SECURITY",
    "PROFILE",
    "HISTORY",
    "COMMUNITY",
    "ZRP",
  ];

  const groupedSignals = categories.map((category) => ({
    category,
    signals: data.signals.filter(
      (signal) => signal.category === category
    ),
  }));

  const formattedDate = new Date(
    data.user.createdAt
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zrp-deepBlack">
      <div className="max-w-2xl mx-auto min-h-screen bg-white dark:bg-zrp-deepBlack">
        {/* Header */}
        <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur">
          <div className="px-4 py-3 flex items-center gap-3">
            <Link
              href={`/profile/${data.user.username}`}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
            </Link>

            <div>
              <h1 className="font-bold text-gray-900 dark:text-white">
                ZRP Trust Passport
              </h1>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Transparent trust signals
              </p>
            </div>
          </div>
        </div>

        {/* User */}
        <section className="px-5 pt-8 pb-6 text-center">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg bg-gray-100 dark:bg-gray-800">
                {data.user.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.name || data.user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-500">
                    {(data.user.name || data.user.username)[0].toUpperCase()}
                  </div>
                )}
              </div>

              <div className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-zrp-red" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-center items-center gap-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {data.user.name || data.user.username}
            </h2>

            {data.user.badgeType && (
              <VerifiedBadge badgeType={data.user.badgeType} />
            )}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            @{data.user.username}
          </p>
        </section>

        {/* Score */}
        <section className="px-5">
          <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-6 text-center">
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-full border-8 border-zrp-red/20 flex items-center justify-center">
                <div>
                  <div
                    className={`text-4xl font-black ${getScoreTextClass(
                      score
                    )}`}
                  >
                    {score}
                  </div>

                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                    / 100
                  </div>
                </div>
              </div>
            </div>

            <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              {data.passport.levelLabel}
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {getLevelDescription(data.passport.level)}
            </p>
          </div>
        </section>

        {/* Account overview */}
        <section className="px-5 mt-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <FileText className="w-5 h-5 mx-auto text-zrp-red" />
              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {data.counts.posts}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Posts
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-zrp-red" />
              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {data.counts.followers}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Followers
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <Calendar className="w-5 h-5 mx-auto text-zrp-red" />
              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {data.user.accountAgeMonths}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Months
              </div>
            </div>
          </div>
        </section>

        {/* Trust signals */}
        <section className="px-5 mt-8 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-zrp-red" />

            <h3 className="font-bold text-gray-900 dark:text-white">
              Trust signals
            </h3>
          </div>

          <div className="space-y-6">
            {groupedSignals.map((group) => {
              if (group.signals.length === 0) return null;

              return (
                <div key={group.category}>
                  <h4 className="text-xs font-bold tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                    {group.category}
                  </h4>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {group.signals.map((signal, index) => (
                      <div
                        key={signal.key}
                        className={`p-4 flex items-start gap-3 ${
                          index !== group.signals.length - 1
                            ? "border-b border-gray-200 dark:border-gray-800"
                            : ""
                        }`}
                      >
                        {signal.verified ? (
                          <CheckCircle2 className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                        )}

                        <div className="min-w-0">
                          <div
                            className={`font-medium text-sm ${
                              signal.verified
                                ? "text-gray-900 dark:text-white"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {signal.title}
                          </div>

                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {signal.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Account information */}
        <section className="px-5 pb-10">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />

              <div>
                <h4 className="font-medium text-sm text-gray-900 dark:text-white">
                  Account history
                </h4>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Joined ZRP in {formattedDate}.
                </p>
              </div>
            </div>

            {data.user.isPrivate && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex items-start gap-3">
                <Lock className="w-5 h-5 text-gray-500 flex-shrink-0" />

                <div>
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white">
                    Private account
                  </h4>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Some profile activity is intentionally private.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Transparency notice */}
        <section className="px-5 pb-12">
          <div className="rounded-xl bg-gray-100 dark:bg-gray-900 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />

            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              The ZRP Trust Passport is based on account and community
              signals available on ZRP. It is designed to provide
              transparency and does not guarantee a person's identity,
              intentions, or future behavior. Trust scores can change as
              account information and activity change.
            </p>
          </div>
        </section>

        {/* Back */}
        <div className="px-5 pb-12">
          <Link
            href={`/profile/${data.user.username}`}
            className="block text-center w-full py-3 rounded-full border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Back to @{data.user.username}
          </Link>
        </div>
      </div>
    </main>
  );
}
