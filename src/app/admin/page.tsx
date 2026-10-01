"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FileText,
  MessageCircle,
  Flag,
  UserCheck,
  UserPlus,
  Activity,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Ticket,
  Newspaper,
  Radio,
  Loader2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import type { TranslationKey } from "@/lib/translations";

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  ADMIN: "adminUsers.roleAdmin",
  MODERATOR: "adminUsers.roleModerator",
  USER: "adminUsers.roleUser",
};

interface Stats {
  users: number;
  posts: number;
  comments: number;
  reports: number;
  pendingReports: number;
  roleCounts: Record<string, number>;
  activeUsers?: number;
}

interface TicketStats {
  open: number;
  inProgress: number;
  awaitingReply: number;
  resolved: number;
  total: number;
}

type LiveKitHealthStatus = "not_configured" | "unauthorized" | "unreachable" | "healthy";

interface LiveKitHealthResult {
  status: LiveKitHealthStatus;
  detail: string;
}

export default function AdminDashboard() {
  const { t, language } = useLanguage();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [liveKitHealth, setLiveKitHealth] = useState<LiveKitHealthResult | null>(null);
  const [liveKitChecking, setLiveKitChecking] = useState(false);
  const [liveKitCheckError, setLiveKitCheckError] = useState(false);

  const [ticketStats, setTicketStats] = useState<TicketStats>({
    open: 0,
    inProgress: 0,
    awaitingReply: 0,
    resolved: 0,
    total: 0,
  });

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

    // Fetch ticket stats
    fetch("/api/admin/support/tickets/stats")
      .then((res) => res.json())
      .then((data) => {
        setTicketStats(data);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  async function checkLiveKitHealth() {
    setLiveKitChecking(true);
    setLiveKitCheckError(false);
    try {
      const res = await fetch("/api/admin/live-audio/health", { cache: "no-store" });
      if (!res.ok) throw new Error("request failed");
      const data: LiveKitHealthResult = await res.json();
      setLiveKitHealth(data);
    } catch {
      setLiveKitHealth(null);
      setLiveKitCheckError(true);
    } finally {
      setLiveKitChecking(false);
    }
  }

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
    {
      label: t("adminDash.openSupportTickets"),
      value: ticketStats.open,
      icon: Ticket,
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      textColor: "text-indigo-600 dark:text-indigo-400",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("adminDash.title")}
        </h1>

        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Activity className="h-4 w-4" />

          <span>
            {t("adminDash.updated", {
              time: new Date().toLocaleTimeString(
                getDateLocale(language)
              ),
            })}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {card.label}
                </p>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {card.value}
                </p>
              </div>

              <div className={`rounded-full p-3 ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.textColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Row */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* User Roles Breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            {t("adminDash.userRoles")}
          </h2>

          <div className="space-y-2">
            {stats?.roleCounts ? (
              Object.entries(stats.roleCounts).map(([role, count]) => (
                <div
                  key={role}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700"
                >
                  <span className="text-sm capitalize text-gray-700 dark:text-gray-300">
                    {t(ROLE_LABEL_KEYS[role] ?? "adminUsers.roleUser")}
                  </span>

                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                {t("adminDash.noRoleData")}
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            {t("adminDash.quickActions")}
          </h2>

          <div className="space-y-3">
            {/* Users */}
            <Link
              href="/admin/users"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Users className="h-5 w-5 text-blue-500" />

              <span>{t("adminDash.manageUsers")}</span>
            </Link>

            {/* Posts */}
            <Link
              href="/admin/posts"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <FileText className="h-5 w-5 text-green-500" />

              <span>{t("adminDash.managePosts")}</span>
            </Link>

            {/* NEWS */}
            <Link
              href="/admin/news"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              <Newspaper className="h-5 w-5 text-red-500" />

              <span>{t("adminDash.manageNews")}</span>
            </Link>

            {/* Reports */}
            <Link
              href="/admin/reports"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Flag className="h-5 w-5 text-red-500" />

              <span>
                {t("adminDash.viewReports")}{" "}
                {stats?.pendingReports
                  ? t("adminDash.pendingSuffix", {
                      n: stats.pendingReports,
                    })
                  : ""}
              </span>
            </Link>

            {/* Payments */}
            <Link
              href="/admin/payments"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <CreditCard className="h-5 w-5 text-green-500" />

              <span>
                {t("adminDash.paymentRequests")}

                {pendingPayments > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {pendingPayments}
                  </span>
                )}
              </span>
            </Link>

            {/* Support Tickets */}
            <Link
              href="/admin/support"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Ticket className="h-5 w-5 text-indigo-500" />

              <span>
                {t("adminDash.supportTickets")}

                {ticketStats.open > 0 && (
                  <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {ticketStats.open}
                  </span>
                )}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Live Audio (LiveKit) health - on-demand only, never auto-run; see
          checkLiveKitHealth() in src/lib/live-audio/livekit.ts for why this
          stays a separate, explicitly-triggered check rather than running
          on every room join. */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Radio className="h-5 w-5 text-zrp-red" aria-hidden="true" />
              {t("adminLiveAudio.healthTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("adminLiveAudio.healthDesc")}
            </p>
          </div>

          <button
            type="button"
            onClick={checkLiveKitHealth}
            disabled={liveKitChecking}
            aria-busy={liveKitChecking}
            className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-50"
          >
            {liveKitChecking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {liveKitChecking ? t("adminLiveAudio.checking") : t("adminLiveAudio.checkNow")}
          </button>
        </div>

        {liveKitCheckError && (
          <p role="alert" className="mt-4 text-sm text-zrp-red">
            {t("adminLiveAudio.checkFailed")}
          </p>
        )}

        {liveKitHealth && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
            <LiveKitStatusIcon status={liveKitHealth.status} />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white">
                {t(LIVEKIT_STATUS_LABEL_KEYS[liveKitHealth.status])}
              </p>
              <p className="mt-0.5 break-words font-mono text-xs text-gray-500 dark:text-gray-400">
                {liveKitHealth.detail}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const LIVEKIT_STATUS_LABEL_KEYS: Record<LiveKitHealthStatus, TranslationKey> = {
  not_configured: "adminLiveAudio.statusNotConfigured",
  unauthorized: "adminLiveAudio.statusUnauthorized",
  unreachable: "adminLiveAudio.statusUnreachable",
  healthy: "adminLiveAudio.statusHealthy",
};

function LiveKitStatusIcon({ status }: { status: LiveKitHealthStatus }) {
  if (status === "healthy") {
    return <CheckCircle className="h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />;
  }
  if (status === "not_configured") {
    return <HelpCircle className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />;
  }
  return <XCircle className="h-5 w-5 shrink-0 text-zrp-red" aria-hidden="true" />;
}
