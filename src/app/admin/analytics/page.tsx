"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Users, FileText, MessageCircle, Heart, Repeat, TrendingUp, Award, Globe, Smartphone, Languages } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import { getCountryName, flagEmoji } from "@/lib/ambassadors/countries";
import type { AnalyticsRange } from "@/lib/date-range";
import type { TranslationKey } from "@/lib/translations";

interface AnalyticsData {
  range: AnalyticsRange;
  summary: {
    users: number;
    posts: number;
    comments: number;
    likes: number;
    reposts: number;
  };
  daily: Array<{
    date: string;
    users: number;
    posts: number;
    comments: number;
    likes: number;
    reposts: number;
  }>;
  topPosts: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { username: string; name: string | null };
    _count: { likes: number; comments: number; reposts: number };
    engagement: number;
  }>;
  engagement: {
    avgLikesPerPost: number;
    avgCommentsPerPost: number;
    totalLikes: number;
    totalComments: number;
    totalPosts: number;
  };
}

interface CountBucket {
  key: string;
  count: number;
}

interface GeographyData {
  range: AnalyticsRange;
  geography: {
    byCountry: CountBucket[];
    byRegion: CountBucket[];
    newUsersByCountry: CountBucket[];
    unknownCountryCount: number;
  };
  acquisition: { bySource: CountBucket[] };
  platform: { byPlatform: CountBucket[] };
  language: { byLanguage: CountBucket[] };
}

const COLORS = ["#FF2D2D", "#FF6B6B", "#FF9F9F", "#FFC1C1"];
const RANGE_OPTIONS: AnalyticsRange[] = ["7", "30", "90", "all"];

function rangeLabelKey(range: AnalyticsRange): TranslationKey {
  switch (range) {
    case "7":
      return "analytics.range7Days";
    case "90":
      return "analytics.range90Days";
    case "all":
      return "analytics.rangeAllTime";
    default:
      return "analytics.range30Days";
  }
}

export default function AnalyticsPage() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [geo, setGeo] = useState<GeographyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<AnalyticsRange>("30");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/analytics?range=${range}`).then((res) => res.json()),
      fetch(`/api/admin/analytics/geography?range=${range}`).then((res) => res.json()),
    ])
      .then(([analyticsData, geographyData]) => {
        setData(analyticsData);
        setGeo(geographyData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>{t("analytics.errLoad")}</p>
      </div>
    );
  }

  const { summary, daily, topPosts, engagement } = data;

  // Prepare daily data for charts
  const chartData = daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString(getDateLocale(language), { month: "short", day: "numeric" }),
    signups: d.users,
    posts: d.posts,
    comments: d.comments,
    likes: d.likes,
    reposts: d.reposts,
  }));

  // Engagement pie data
  const pieData = [
    { name: t("analytics.likes"), value: engagement.totalLikes },
    { name: t("analytics.comments"), value: engagement.totalComments },
    { name: t("analytics.reposts"), value: summary.reposts },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("analytics.title")}</h1>
        <div
          role="group"
          aria-label={t("analytics.rangeSelectorLabel")}
          className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                range === option
                  ? "bg-zrp-red text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {t(rangeLabelKey(option))}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.users")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.users}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <FileText className="w-8 h-8 text-green-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.posts")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.posts}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <MessageCircle className="w-8 h-8 text-purple-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.comments")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.comments}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Heart className="w-8 h-8 text-red-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.likes")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.likes}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <Repeat className="w-8 h-8 text-orange-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.reposts")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.reposts}</p>
          </div>
        </div>
      </div>

      {/* ─── Engagement Metrics ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("analytics.avgLikesPerPost")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{engagement.avgLikesPerPost}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("analytics.avgCommentsPerPost")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{engagement.avgCommentsPerPost}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("analytics.totalPosts")}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{engagement.totalPosts}</p>
        </div>
      </div>

      {/* ─── Charts ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t("analytics.dailyActivity")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="posts" stroke="#FF2D2D" name={t("analytics.posts")} />
              <Line type="monotone" dataKey="comments" stroke="#8B5CF6" name={t("analytics.comments")} />
              <Line type="monotone" dataKey="likes" stroke="#EC4899" name={t("analytics.likes")} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t("analytics.userGrowth")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="signups" fill="#FF2D2D" name={t("analytics.newUsers")} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Engagement Pie Chart ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t("analytics.engagementBreakdown")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t("analytics.topPosts")}</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topPosts.map((post, idx) => (
              <div key={post.id} className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{post.content}</p>
                  <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span><bdi>@{post.author.username}</bdi></span>
                    <span>❤️ {post._count.likes}</span>
                    <span>💬 {post._count.comments}</span>
                    <span>🔄 {post._count.reposts}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-zrp-red">{post.engagement}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Geography / Acquisition / Platform / Language ─────────────── */}
      {geo && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-zrp-red" />
            {t("analytics.geographyTitle")}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {t("analytics.usersByCountry")}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={geo.geography.byCountry.slice(0, 10).map((b) => ({
                    label: countryBucketLabel(b.key, language),
                    count: b.count,
                  }))}
                  layout="vertical"
                  margin={{ left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#FF2D2D" name={t("analytics.users")} />
                </BarChart>
              </ResponsiveContainer>
              {geo.geography.unknownCountryCount > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t("analytics.unknownGeographyCount", { count: geo.geography.unknownCountryCount })}
                </p>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {t("analytics.newUsersByCountry")}
              </h3>
              <BucketList
                buckets={geo.geography.newUsersByCountry}
                labelFor={(key) => countryBucketLabel(key, language)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-zrp-red" />
                {t("analytics.acquisitionTitle")}
              </h3>
              <BucketList
                buckets={geo.acquisition.bySource}
                labelFor={(key) => t(sourceLabelKey(key))}
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-zrp-red" />
                {t("analytics.platformTitle")}
              </h3>
              <BucketList
                buckets={geo.platform.byPlatform}
                labelFor={(key) => t(platformLabelKey(key))}
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Languages className="w-4 h-4 text-zrp-red" />
                {t("analytics.languageTitle")}
              </h3>
              <BucketList
                buckets={geo.language.byLanguage}
                labelFor={(key) => (key === "UNKNOWN" ? t("analytics.unknownBucket") : key.toUpperCase())}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function countryBucketLabel(key: string, language: string): string {
  if (key === "OTHER") return "Other";
  if (key === "UNKNOWN") return "Unknown";
  const name = getCountryName(key, language as Parameters<typeof getCountryName>[1]);
  return name ? `${flagEmoji(key)} ${name}` : key;
}

function sourceLabelKey(key: string): TranslationKey {
  switch (key) {
    case "REFERRAL":
      return "analytics.signupSourceReferral";
    case "CAMPAIGN":
      return "analytics.signupSourceCampaign";
    case "UNKNOWN":
      return "analytics.signupSourceUnknown";
    default:
      return "analytics.signupSourceDirect";
  }
}

function platformLabelKey(key: string): TranslationKey {
  switch (key) {
    case "android":
      return "analytics.platformAndroid";
    case "ios":
      return "analytics.platformIos";
    case "UNKNOWN":
      return "analytics.platformUnknown";
    default:
      return "analytics.platformWeb";
  }
}

/** A simple labeled bucket list with a proportional bar per row - used
 * for every breakdown here that doesn't need a full chart (acquisition
 * source, platform, language, and the compact new-users-by-country
 * view). Keeps all four breakdowns visually consistent. */
function BucketList({
  buckets,
  labelFor,
}: {
  buckets: CountBucket[];
  labelFor: (key: string) => string;
}) {
  if (buckets.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">-</p>;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="space-y-2">
      {buckets.slice(0, 10).map((bucket) => (
        <div key={bucket.key} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300 w-28 shrink-0 truncate">
            {labelFor(bucket.key)}
          </span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-zrp-red"
              style={{ width: `${Math.max(4, (bucket.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 w-10 text-right shrink-0">
            {bucket.count}
          </span>
        </div>
      ))}
    </div>
  );
}
