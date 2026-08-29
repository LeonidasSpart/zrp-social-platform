"use client";

import { useEffect, useState, use } from "react";
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
  Activity,
  Award,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

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

/*
 * ---------------------------------------------------------------
 * TRUST LEVEL DESCRIPTION
 * ---------------------------------------------------------------
 */

const LEVEL_DESC_KEYS: Record<TrustData["passport"]["level"], TranslationKey> = {
  EXCELLENT: "trust.levelDescExcellent",
  HIGH: "trust.levelDescHigh",
  GOOD: "trust.levelDescGood",
  MODERATE: "trust.levelDescModerate",
  LOW: "trust.levelDescLow",
};

const LEVEL_LABEL_KEYS: Record<TrustData["passport"]["level"], TranslationKey> = {
  EXCELLENT: "trust.levelExcellent",
  HIGH: "trust.levelHigh",
  GOOD: "trust.levelGood",
  MODERATE: "trust.levelModerate",
  LOW: "trust.levelLow",
};

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  SECURITY: "trust.categorySecurity",
  PROFILE: "trust.categoryProfile",
  HISTORY: "trust.categoryHistory",
  COMMUNITY: "trust.categoryCommunity",
  ZRP: "trust.categoryZrp",
};

const SIGNAL_LABEL_KEYS: Record<string, { titleKey: TranslationKey; descKey: TranslationKey }> = {
  email: { titleKey: "trust.signalEmailTitle", descKey: "trust.signalEmailDesc" },
  avatar: { titleKey: "trust.signalAvatarTitle", descKey: "trust.signalAvatarDesc" },
  cover: { titleKey: "trust.signalCoverTitle", descKey: "trust.signalCoverDesc" },
  name: { titleKey: "trust.signalNameTitle", descKey: "trust.signalNameDesc" },
  bio: { titleKey: "trust.signalBioTitle", descKey: "trust.signalBioDesc" },
  location: { titleKey: "trust.signalLocationTitle", descKey: "trust.signalLocationDesc" },
  website: { titleKey: "trust.signalWebsiteTitle", descKey: "trust.signalWebsiteDesc" },
  community: { titleKey: "trust.signalCommunityTitle", descKey: "trust.signalCommunityDesc" },
  followers: { titleKey: "trust.signalFollowersTitle", descKey: "trust.signalFollowersDesc" },
  verified: { titleKey: "trust.signalVerifiedTitle", descKey: "trust.signalVerifiedDesc" },
};

/*
 * ---------------------------------------------------------------
 * SCORE COLOR
 * ---------------------------------------------------------------
 */

function getScoreTextClass(score: number) {
  if (score >= 90) return "text-zrp-red";
  if (score >= 75) return "text-zrp-red";
  if (score >= 55) return "text-zrp-red";

  return "text-gray-600 dark:text-gray-300";
}

/*
 * ---------------------------------------------------------------
 * LEVEL BADGE
 * ---------------------------------------------------------------
 */

function getLevelBadgeClass(
  level: TrustData["passport"]["level"]
) {
  switch (level) {
    case "EXCELLENT":
      return "bg-zrp-red/10 text-zrp-red border-zrp-red/20";

    case "HIGH":
      return "bg-zrp-red/10 text-zrp-red border-zrp-red/20";

    case "GOOD":
      return "bg-zrp-red/10 text-zrp-red border-zrp-red/20";

    case "MODERATE":
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";

    case "LOW":
    default:
      return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
  }
}

/*
 * ---------------------------------------------------------------
 * FORMAT LARGE NUMBERS
 * ---------------------------------------------------------------
 */

function formatCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000)
      .toFixed(1)
      .replace(/\.0$/, "")}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000)
      .toFixed(1)
      .replace(/\.0$/, "")}K`;
  }

  return value.toString();
}

/*
 * ---------------------------------------------------------------
 * TRUST PASSPORT PAGE
 * ---------------------------------------------------------------
 */

export default function TrustPassportPage(
  props: {
    params: Promise<{ username: string }>;
  }
) {
  const params = use(props.params);
  const { t } = useLanguage();
  const [data, setData] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
   * -------------------------------------------------------------
   * LOAD TRUST PASSPORT
   * -------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    const loadTrustPassport = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `/api/users/${encodeURIComponent(
            params.username
          )}/trust`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        if (!res.ok) {
          throw new Error("Trust Passport unavailable");
        }

        const result: TrustData = await res.json();

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        console.error("Trust Passport loading error:", err);

        if (!cancelled) {
          setError(t("trust.errUnableToLoad"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTrustPassport();

    return () => {
      cancelled = true;
    };
  }, [params.username]);

  /*
   * -------------------------------------------------------------
   * LOADING STATE
   * -------------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zrp-deepBlack">
        <Loader2 className="w-7 h-7 animate-spin text-zrp-red" />
      </div>
    );
  }

  /*
   * -------------------------------------------------------------
   * ERROR STATE
   * -------------------------------------------------------------
   */

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white dark:bg-zrp-deepBlack flex flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="w-14 h-14 text-gray-400 mb-4" />

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("trust.unavailableTitle")}
        </h1>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
          {error || t("trust.notFoundFallback")}
        </p>

        <Link
          href={`/profile/${encodeURIComponent(
            params.username
          )}`}
          className="mt-6 px-5 py-2 rounded-full bg-zrp-red text-white text-sm font-medium hover:bg-zrp-darkRed transition"
        >
          {t("trust.backToProfile")}
        </Link>
      </div>
    );
  }

  const score = Math.max(
    0,
    Math.min(100, data.passport.score)
  );

  /*
   * -------------------------------------------------------------
   * GROUP TRUST SIGNALS
   * -------------------------------------------------------------
   */

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

  /*
   * -------------------------------------------------------------
   * ACCOUNT DATE
   * -------------------------------------------------------------
   */

  const formattedDate = new Date(
    data.user.createdAt
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  /*
   * -------------------------------------------------------------
   * ACCOUNT AGE TEXT
   * -------------------------------------------------------------
   *
   * The API calculates these values automatically from createdAt.
   */

  const accountAgeYears = Math.floor(data.user.accountAgeMonths / 12);

  const accountAgeText =
    data.user.accountAgeMonths >= 12
      ? t(accountAgeYears === 1 ? "trust.yearsSingular" : "trust.yearsPlural", { n: accountAgeYears })
      : t(data.user.accountAgeMonths === 1 ? "trust.monthsSingular" : "trust.monthsPlural", { n: data.user.accountAgeMonths });

  /*
   * -------------------------------------------------------------
   * RENDER
   * -------------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zrp-deepBlack">
      <div className="max-w-2xl mx-auto min-h-screen bg-white dark:bg-zrp-deepBlack">
        {/* =========================================================
            HEADER
        ========================================================= */}

        <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur">
          <div className="px-4 py-3 flex items-center gap-3">
            <Link
              href={`/profile/${data.user.username}`}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label={t("trust.backToProfile")}
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
            </Link>

            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white">
                {t("trust.headerTitle")}
              </h1>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("trust.headerSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================
            USER
        ========================================================= */}

        <section className="px-5 pt-8 pb-6 text-center">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg bg-gray-100 dark:bg-gray-800">
                {data.user.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={
                      data.user.name ||
                      data.user.username
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-500">
                    {(
                      data.user.name ||
                      data.user.username
                    )[0].toUpperCase()}
                  </div>
                )}
              </div>

              <div className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-7 h-7 text-zrp-red" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-center items-center gap-1 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {data.user.name ||
                data.user.username}
            </h2>

            {data.user.badgeType && (
              <VerifiedBadge
                badgeType={data.user.badgeType}
              />
            )}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            @{data.user.username}
          </p>

          {/* Trust level badge */}

          <div className="mt-3 flex justify-center">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${getLevelBadgeClass(
                data.passport.level
              )}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t(LEVEL_LABEL_KEYS[data.passport.level])}
            </span>
          </div>
        </section>

        {/* =========================================================
            SCORE
        ========================================================= */}

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
                    {t("trust.outOf100")}
                  </div>
                </div>
              </div>
            </div>

            <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              {t(LEVEL_LABEL_KEYS[data.passport.level])}
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {t(LEVEL_DESC_KEYS[data.passport.level])}
            </p>

            <div className="mt-4 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-zrp-red transition-all duration-500"
                style={{
                  width: `${score}%`,
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              {t("trust.scoreFootnote")}
            </p>
          </div>
        </section>

        {/* =========================================================
            ACCOUNT OVERVIEW
        ========================================================= */}

        <section className="px-5 mt-5">
          <div className="grid grid-cols-3 gap-3">
            {/* Posts */}

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <FileText className="w-5 h-5 mx-auto text-zrp-red" />

              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {formatCount(
                  data.counts.posts
                )}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t("trust.statPosts")}
              </div>
            </div>

            {/* Followers */}

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-zrp-red" />

              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {formatCount(
                  data.counts.followers
                )}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t("trust.statFollowers")}
              </div>
            </div>

            {/* Account age */}

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
              <Calendar className="w-5 h-5 mx-auto text-zrp-red" />

              <div className="mt-2 font-bold text-gray-900 dark:text-white">
                {accountAgeText}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t("trust.statOnZrp")}
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            ACCOUNT AGE DETAIL
        ========================================================= */}

        <section className="px-5 mt-5">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
                  {t("trust.accountHistoryTitle")}
                </h4>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("trust.joinedIn", { date: formattedDate })}
                </p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("trust.accountAgeLabel")}{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {accountAgeText}
                  </span>
                  {" · "}
                  {t("trust.daysSuffix", { days: data.user.accountAgeDays })}
                </p>

                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                  {t("trust.accountAgeFootnote")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            TRUST SIGNALS
        ========================================================= */}

        <section className="px-5 mt-8 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-zrp-red" />

            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                {t("trust.trustSignalsTitle")}
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("trust.trustSignalsSubtitle")}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {groupedSignals.map((group) => {
              if (
                group.signals.length === 0
              ) {
                return null;
              }

              return (
                <div key={group.category}>
                  <h4 className="text-xs font-bold tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                    {t(CATEGORY_LABEL_KEYS[group.category] ?? "trust.categoryZrp")}
                  </h4>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {group.signals.map(
                      (signal, index) => {
                        let title: string;
                        let description: string;

                        if (signal.key === "account-age") {
                          const established = data.user.accountAgeMonths >= 12;
                          title = t(
                            established
                              ? "trust.signalAccountAgeTitleEstablished"
                              : "trust.signalAccountAgeTitleHistory"
                          );
                          description = established
                            ? t("trust.signalAccountAgeDescEstablished")
                            : t(
                                data.user.accountAgeMonths === 1
                                  ? "trust.signalAccountAgeDescHistorySingular"
                                  : "trust.signalAccountAgeDescHistoryPlural",
                                { months: data.user.accountAgeMonths }
                              );
                        } else {
                          const labelKeys = SIGNAL_LABEL_KEYS[signal.key];
                          title = labelKeys ? t(labelKeys.titleKey) : signal.title;
                          description = labelKeys ? t(labelKeys.descKey) : signal.description;
                        }

                        return (
                          <div
                            key={signal.key}
                            className={`p-4 flex items-start gap-3 ${
                              index !==
                              group.signals.length -
                                1
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
                                {title}
                              </div>

                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {description}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* =========================================================
            COMMUNITY INFORMATION
        ========================================================= */}

        <section className="px-5 pb-10">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <Activity className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
                  {t("trust.communityParticipationTitle")}
                </h4>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("trust.communityParticipationDesc", {
                    posts: formatCount(data.counts.posts),
                    followers: formatCount(data.counts.followers),
                  })}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            PRIVATE ACCOUNT
        ========================================================= */}

        {data.user.isPrivate && (
          <section className="px-5 pb-10">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-gray-500 flex-shrink-0" />

                <div>
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white">
                    {t("trust.privateAccountTitle")}
                  </h4>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t("trust.privateAccountDesc")}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================
            VERIFICATION INFORMATION
        ========================================================= */}

        <section className="px-5 pb-10">
          <div className="rounded-xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-4">
            <div className="flex items-start gap-3">
              <Award className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
                  {t("trust.whatItMeansTitle")}
                </h4>

                <p className="text-xs leading-5 text-gray-600 dark:text-gray-400 mt-1">
                  {t("trust.whatItMeansDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            TRANSPARENCY NOTICE
        ========================================================= */}

        <section className="px-5 pb-12">
          <div className="rounded-xl bg-gray-100 dark:bg-gray-900 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />

            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              {t("trust.transparencyNotice")}
            </p>
          </div>
        </section>

        {/* =========================================================
            BACK TO PROFILE
        ========================================================= */}

        <div className="px-5 pb-12">
          <Link
            href={`/profile/${data.user.username}`}
            className="block text-center w-full py-3 rounded-full border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("trust.backToUsername", { username: data.user.username })}
          </Link>
        </div>
      </div>
    </main>
  );
}
