"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
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
import { Users, FileText, MessageCircle, Heart, Repeat, TrendingUp, Award } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnalyticsData {
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

const COLORS = ["#FF2D2D", "#FF6B6B", "#FF9F9F", "#FFC1C1"];

export default function AnalyticsPage() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">
          <p>{t("analytics.errLoad")}</p>
        </div>
      </AdminLayout>
    );
  }

  const { summary, daily, topPosts, engagement } = data;

  // Prepare daily data for charts
  const chartData = daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString(localeMap[language] || "en-US", { month: "short", day: "numeric" }),
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
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("analytics.title")}</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t("analytics.last30Days")}
        </span>
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
                    <span>@{post.author.username}</span>
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
    </AdminLayout>
  );
}
