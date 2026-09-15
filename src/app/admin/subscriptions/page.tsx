"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, TrendingUp, AlertTriangle, Users, DollarSign } from "lucide-react";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin > Subscriptions & Billing.
 *
 * ⚠️ TRANSLATION GAP (deliberate, same as admin/news-network/page.tsx):
 * this is a staff-only surface and its copy lives here in English rather
 * than in the shared 15-language dictionary, for the same reason - see
 * that file's comment for the full rationale.
 *
 * Every number here comes from GET /api/admin/subscriptions, which reads
 * the real Subscription/SubscriptionPayment tables - nothing is
 * estimated or placeholder. The revenue total is explicitly scoped to
 * "since this feature's launch" (see the overview response) since
 * payments verified before it existed have no SubscriptionPayment row.
 */

const COPY = {
  title: "Subscriptions & Billing",
  subtitle: "The authoritative record of every user's paid entitlement - never just User.plan.",
  searchPlaceholder: "Search username, name or email...",
  filters: { plan: "Plan", status: "Status", interval: "Interval", expiring: "Expiring", all: "All" },
  expiringOptions: { any: "Any time", d7: "Within 7 days", d30: "Within 30 days" },
  table: {
    user: "User",
    plan: "Plan",
    status: "Status",
    interval: "Interval",
    period: "Current period",
    daysRemaining: "Days left",
    lastPayment: "Last payment",
    reminder: "Reminder",
    legacy: "Legacy",
  },
  empty: "No subscriptions match these filters.",
  prev: "Previous",
  next: "Next",
  pageOf: (p: number, total: number) => `Page ${p} of ${total}`,
};

interface OverviewData {
  active: number;
  expired: number;
  canceled: number;
  pending: number;
  expiringWithin7Days: number;
  expiringWithin30Days: number;
  failedPayments: number;
  paidUsers: number;
  freeUsers: number;
  revenueByPlan: { plan: string; billingInterval: string; totalAmount: number; count: number }[];
  revenueDataAvailableSince: string;
}

interface SubscriptionRow {
  id: string;
  userId: string;
  user: { id: string; username: string; email: string; name: string | null; plan: string; badgeType: string | null };
  plan: string;
  status: string;
  billingInterval: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  daysRemaining: number | null;
  lastPaymentAt: string | null;
  reminderSentAt: string | null;
  isLegacyBackfill: boolean;
  lastPayment: { paymentMethod: string; amount: number } | null;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  EXPIRED: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  CANCELED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export default function AdminSubscriptionsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [interval, setInterval] = useState("ALL");
  const [expiringWithin, setExpiringWithin] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (plan !== "ALL") qs.set("plan", plan);
      if (status !== "ALL") qs.set("status", status);
      if (interval !== "ALL") qs.set("interval", interval);
      if (expiringWithin) qs.set("expiringWithin", expiringWithin);
      qs.set("page", String(page));
      const res = await fetch(`/api/admin/subscriptions?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to load subscriptions");
      const data = await res.json();
      setOverview(data.overview);
      setRows(data.subscriptions);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [search, plan, status, interval, expiringWithin, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search/filter changes
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, plan, status, interval, expiringWithin]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{COPY.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{COPY.subtitle}</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Users className="w-5 h-5" />} label="Active" value={overview.active} />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Expiring in 7d" value={overview.expiringWithin7Days} warn />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Expiring in 30d" value={overview.expiringWithin30Days} />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Canceled" value={overview.canceled} />
          <StatCard icon={<Users className="w-5 h-5" />} label="Paid users" value={overview.paidUsers} />
          <StatCard icon={<Users className="w-5 h-5" />} label="Free users" value={overview.freeUsers} />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Failed payments" value={overview.failedPayments} warn />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Revenue (all-time, this feature)"
            value={`$${overview.revenueByPlan.reduce((sum, r) => sum + r.totalAmount, 0).toFixed(2)}`}
          />
        </div>
      )}
      {overview && (
        <p className="text-xs text-gray-400 mb-6">
          Revenue figures cover {overview.revenueDataAvailableSince}.
        </p>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={COPY.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          />
        </div>
        <Select label={COPY.filters.plan} value={plan} onChange={setPlan} options={["ALL", "pro", "business", "enterprise", "free"]} />
        <Select label={COPY.filters.status} value={status} onChange={setStatus} options={["ALL", "ACTIVE", "EXPIRED", "CANCELED", "PENDING"]} />
        <Select label={COPY.filters.interval} value={interval} onChange={setInterval} options={["ALL", "MONTHLY", "YEARLY"]} />
        <select
          value={expiringWithin}
          onChange={(e) => setExpiringWithin(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">{COPY.expiringOptions.any}</option>
          <option value="7">{COPY.expiringOptions.d7}</option>
          <option value="30">{COPY.expiringOptions.d30}</option>
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">{COPY.empty}</div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3">{COPY.table.user}</th>
                <th className="px-4 py-3">{COPY.table.plan}</th>
                <th className="px-4 py-3">{COPY.table.status}</th>
                <th className="px-4 py-3">{COPY.table.interval}</th>
                <th className="px-4 py-3">{COPY.table.period}</th>
                <th className="px-4 py-3">{COPY.table.daysRemaining}</th>
                <th className="px-4 py-3">{COPY.table.lastPayment}</th>
                <th className="px-4 py-3">{COPY.table.reminder}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/subscriptions/${row.userId}`} className="block">
                      <AdminUserIdentity user={row.user} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {row.plan}
                    {row.isLegacyBackfill && (
                      <span className="ml-1 text-[10px] uppercase text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1">
                        {COPY.table.legacy}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[row.status] || ""}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3">{row.billingInterval || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                    {row.currentPeriodStart ? new Date(row.currentPeriodStart).toLocaleDateString() : "-"} &rarr;{" "}
                    {row.currentPeriodEnd ? new Date(row.currentPeriodEnd).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3">{row.daysRemaining ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {row.lastPayment ? `${row.lastPayment.paymentMethod} ($${row.lastPayment.amount})` : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.reminderSentAt ? "Sent" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            {COPY.prev}
          </button>
          <span className="text-gray-500">{COPY.pageOf(pagination.page, pagination.totalPages)}</span>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            {COPY.next}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className={`flex items-center gap-2 text-xs mb-1 ${warn ? "text-amber-600" : "text-gray-500"}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm capitalize"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "ALL" ? "All" : o}
        </option>
      ))}
    </select>
  );
}
