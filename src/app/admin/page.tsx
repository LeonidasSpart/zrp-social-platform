"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, FileText, MessageCircle, Flag, UserCheck, UserPlus,
  Activity, AlertTriangle, UserX, CheckCircle, CreditCard,
  Ticket // ➕ ADDED
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Stats {
  users: number;
  posts: number;
  comments: number;
  reports: number;
  pendingReports: number;
  roleCounts: Record<string, number>;
  activeUsers?: number;
}

// ➕ ADDED: interface for ticket stats
interface TicketStats {
  open: number;
  inProgress: number;
  awaitingReply: number;
  resolved: number;
  total: number;
}

export default function AdminDashboard() {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState(0);
  // ➕ ADDED: ticket stats state
  const [ticketStats, setTicketStats] = useState<TicketStats>({
    open: 0,
    inProgress: 0,
    awaitingReply: 0,
    resolved: 0,
    total: 0,
  });

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  useEffect(() => {
    // Fetch main stats
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Stats error:", err);
        setLoading(false);
      });

    // Fetch pending payments count
    fetch("/api/admin/payments")
      .then((res) => res.json())
      .then((data) => {
        setPendingPayments(data.length || 0);
      })
      .catch(() => {});

    // ➕ ADDED: fetch ticket stats
    fetch("/api/admin/support/tickets/stats")
      .then((res) => res.json())
      .then((data) => {
        setTicketStats(data);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  // Card configuration with safe color classes
  const cards = [
    {
      label: t("adminDash.totalUsers"),
      value: stats?.users || 0,
      icon: Users,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: t("adminDash.totalPosts"),
      value: stats?.posts || 0,
      icon: FileText,
      bgColor: "bg-green-100 dark:bg-green-900/30",
      textColor: "text-green-600 dark:text-green-400",
    },
    {
      label: t("adminDash.totalComments"),
      value: stats?.comments || 0,
      icon: MessageCircle,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-600 dark:text-purple-400",
    },
    {
      label: t("adminDash.pendingReports"),
      value: stats?.pendingReports || 0,
      icon: AlertTriangle,
      bgColor: "bg-red-100 dark:bg-red-900/30",
      textColor: "text-red-600 dark:text-red-400",
    },
    {
      label: t("adminDash.totalReports"),
      value: stats?.reports || 0,
      icon: Flag,
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      textColor: "text-yellow-600 dark:text-yellow-400",
    },
    {
      label: t("adminDash.admins"),
      value: stats?.roleCounts?.ADMIN || 0,
      icon: UserCheck,
      bgColor: "bg-rose-100 dark:bg-rose-900/30",
      textColor: "text-rose-600 dark:text-rose-400",
    },
    {
      label: t("adminDash.moderators"),
      value: stats?.roleCounts?.MODERATOR || 0,
      icon: UserPlus,
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      textColor: "text-orange-600 dark:text-orange-400",
    },
    {
      label: t("adminDash.activeUsers"),
      value: stats?.activeUsers ?? stats?.users ?? 0,
      icon: CheckCircle,
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      textColor: "text-teal-600 dark:text-teal-400",
    },
    // ➕ ADDED: Support Tickets card
    {
      label: "Open Support Tickets",
      value: ticketStats.open,
      icon: Ticket,
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      textColor: "text-indigo-600 dark:text-indigo-400",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminDash.title")}</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Activity className="w-4 h-4" />
          <span>{t("adminDash.updated", { time: new Date().toLocaleTimeString(localeMap[language] || "en-US") })}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              </div>
              <div className={`p-3 rounded-full ${card.bgColor}`}>
                <card.icon className={`w-5 h-5 ${card.textColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Row */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Roles Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("adminDash.userRoles")}</h2>
          <div className="space-y-2">
            {stats?.roleCounts ? (
              Object.entries(stats.roleCounts).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{role}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">{t("adminDash.noRoleData")}</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("adminDash.quickActions")}</h2>
          <div className="space-y-3">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <Users className="w-5 h-5 text-blue-500" />
              <span>{t("adminDash.manageUsers")}</span>
            </Link>
            <Link
              href="/admin/posts"
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <FileText className="w-5 h-5 text-green-500" />
              <span>{t("adminDash.managePosts")}</span>
            </Link>
            <Link
              href="/admin/reports"
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <Flag className="w-5 h-5 text-red-500" />
              <span>
                {t("adminDash.viewReports")} {stats?.pendingReports ? t("adminDash.pendingSuffix", { n: stats.pendingReports }) : ""}
              </span>
            </Link>
            <Link
              href="/admin/payments"
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <CreditCard className="w-5 h-5 text-green-500" />
              <span>
                {t("adminDash.paymentRequests")}
                {pendingPayments > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {pendingPayments}
                  </span>
                )}
              </span>
            </Link>
            {/* ➕ ADDED: Support Tickets quick action */}
            <Link
              href="/admin/support"
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <Ticket className="w-5 h-5 text-indigo-500" />
              <span>
                Support Tickets
                {ticketStats.open > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {ticketStats.open}
                  </span>
                )}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
