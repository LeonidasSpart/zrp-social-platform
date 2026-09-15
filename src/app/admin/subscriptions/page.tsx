"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, TrendingUp, AlertTriangle, Users, DollarSign, RefreshCw, ChevronRight } from "lucide-react";
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
 * the real User + Subscription/SubscriptionPayment tables - nothing is
 * estimated or placeholder. The revenue total is explicitly scoped to
 * "since this feature's launch" (see the overview response) since
 * payments verified before it existed have no SubscriptionPayment row.
 *
 * Filter state lives in the URL (not just component state) so a KPI card
 * can literally be a <Link> to the query that reproduces its own count,
 * refreshing preserves the view, and the back/forward buttons work - see
 * docs/subscriptions.md "Admin dashboard: KPI/filter/URL contract".
 */

const COPY = {
  title: "Subscriptions & Billing",
  subtitle: "The authoritative record of every user's paid entitlement - never just User.plan.",
  searchPlaceholder: "Search username, name or email...",
  filters: { plan: "Plan", status: "Status", interval: "Interval", expiring: "Expiring", all: "All" },
  statusOptions: [
    { value: "ALL", label: "All" },
    { value: "PAID", label: "Paid (currently entitled)" },
    { value: "FREE", label: "Free (currently not entitled)" },
    { value: "ACTIVE", label: "Active subscription" },
    { value: "EXPIRED", label: "Expired" },
    { value: "CANCELED", label: "Canceled" },
    { value: "PENDING", label: "Pending" },
    { value: "NO_SUBSCRIPTION", label: "Paid, needs reconciliation" },
  ],
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
  needsReconciliation: number;
  revenueByPlan: { plan: string; billingInterval: string; totalAmount: number; count: number }[];
  revenueDataAvailableSince: string;
}

interface SubscriptionRow {
  id: string | null;
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
  needsReconciliation: boolean;
  lastPayment: { paymentMethod: string; amount: number } | null;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  EXPIRED: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  CANCELED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  FREE: "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400",
  NO_SUBSCRIPTION: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function paramsToQuery(sp: URLSearchParams) {
  const qs = new URLSearchParams();
  for (const key of ["search", "plan", "status", "interval", "expiringWithin", "page"]) {
    const v = sp.get(key);
    if (v) qs.set(key, v);
  }
  return qs;
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || "";
  const plan = searchParams.get("plan") || "ALL";
  const status = searchParams.get("status") || "ALL";
  const interval = searchParams.get("interval") || "ALL";
  const expiringWithin = searchParams.get("expiringWithin") || "";

  // Local text-input state so the search box doesn't fight the user while
  // they're typing - it's debounced into the URL (the actual query state).
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function setParam(key: string, value: string) {
    const qs = new URLSearchParams(searchParams.toString());
    if (value) qs.set(key, value);
    else qs.delete(key);
    if (key !== "page") qs.delete("page"); // any real filter change resets pagination
    router.push(`/admin/subscriptions?${qs.toString()}`);
  }

  // Latest-request-wins: an in-flight request from a since-superseded
  // filter/search must never clobber a newer one that resolves first
  // (e.g. a fast "business" typed over a slow "b" - see
  // docs/subscriptions.md "Search race safety").
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const qs = paramsToQuery(searchParams);
      const res = await fetch(`/api/admin/subscriptions?${qs.toString()}`);
      if (seq !== requestSeq.current) return; // superseded - drop this response
      if (!res.ok) throw new Error(`Failed to load subscriptions (${res.status})`);
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      setOverview(data.overview);
      setRows(data.subscriptions);
      setPagination(data.pagination);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce typed search into the URL only - filter selects apply immediately.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => setParam("search", searchInput), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const kpiHref = (params: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return `/admin/subscriptions?${qs.toString()}`;
  };
  const isActiveKpi = (params: Record<string, string>) =>
    (params.status || "ALL") === status && (params.expiringWithin || "") === expiringWithin;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{COPY.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{COPY.subtitle}</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Paid users"
            value={overview.paidUsers}
            href={kpiHref({ status: "PAID" })}
            active={isActiveKpi({ status: "PAID" })}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Free users"
            value={overview.freeUsers}
            href={kpiHref({ status: "FREE" })}
            active={isActiveKpi({ status: "FREE" })}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Active"
            value={overview.active}
            href={kpiHref({ status: "ACTIVE" })}
            active={isActiveKpi({ status: "ACTIVE" })}
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Expiring in 7d"
            value={overview.expiringWithin7Days}
            href={kpiHref({ status: "ACTIVE", expiringWithin: "7" })}
            active={isActiveKpi({ status: "ACTIVE", expiringWithin: "7" })}
            warn
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Expiring in 30d"
            value={overview.expiringWithin30Days}
            href={kpiHref({ status: "ACTIVE", expiringWithin: "30" })}
            active={isActiveKpi({ status: "ACTIVE", expiringWithin: "30" })}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Expired"
            value={overview.expired}
            href={kpiHref({ status: "EXPIRED" })}
            active={isActiveKpi({ status: "EXPIRED" })}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Canceled"
            value={overview.canceled}
            href={kpiHref({ status: "CANCELED" })}
            active={isActiveKpi({ status: "CANCELED" })}
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Needs reconciliation"
            value={overview.needsReconciliation}
            href={kpiHref({ status: "NO_SUBSCRIPTION" })}
            active={isActiveKpi({ status: "NO_SUBSCRIPTION" })}
            warn
            title="Paid per the legacy plan field but has no Subscription record yet - run scripts/backfill-subscriptions.ts or grant manually."
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Failed payments"
            value={overview.failedPayments}
            href="/admin/payments"
            warn
            title="Rejected PaymentRequests aren't tied to a Subscription record - opens the Payments queue instead."
          />
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={COPY.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          />
        </div>
        <Select
          label={COPY.filters.plan}
          value={plan}
          onChange={(v) => setParam("plan", v === "ALL" ? "" : v)}
          options={["ALL", "pro", "business", "enterprise", "free"]}
        />
        <select
          aria-label={COPY.filters.status}
          value={status}
          onChange={(e) => setParam("status", e.target.value === "ALL" ? "" : e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
        >
          {COPY.statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Select
          label={COPY.filters.interval}
          value={interval}
          onChange={(v) => setParam("interval", v === "ALL" ? "" : v)}
          options={["ALL", "MONTHLY", "YEARLY"]}
        />
        <select
          value={expiringWithin}
          onChange={(e) => setParam("expiringWithin", e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">{COPY.expiringOptions.any}</option>
          <option value="7">{COPY.expiringOptions.d7}</option>
          <option value="30">{COPY.expiringOptions.d30}</option>
        </select>
        {(search || plan !== "ALL" || status !== "ALL" || interval !== "ALL" || expiringWithin) && (
          <button
            onClick={() => router.push("/admin/subscriptions")}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4 flex items-center justify-between gap-4">
          <span>{error} - this is a request failure, not an empty result.</span>
          <button onClick={load} className="inline-flex items-center gap-1 text-sm font-medium underline shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? null : rows.length === 0 ? (
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
                <tr key={row.userId} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    {/*
                      AdminUserIdentity already renders its own <Link>s (to
                      /profile/username) - wrapping it in another <Link> to
                      the billing detail page (as this used to) produces
                      invalid nested <a> tags. Browsers silently repair
                      nested anchors by breaking the DOM structure, which is
                      exactly the class of bug behind "clicking rows doesn't
                      do what's expected": a real, reproducible hydration
                      error (confirmed via a live browser console during
                      this fix), not just a cosmetic HTML nit. A separate,
                      un-nested link to the billing detail keeps both
                      destinations reachable without invalid markup.
                    */}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <AdminUserIdentity user={row.user} />
                      </div>
                      <Link
                        href={`/admin/subscriptions/${row.userId}`}
                        className="shrink-0 inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-zrp-red"
                        title="View billing detail"
                      >
                        Billing <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {row.plan}
                    {row.isLegacyBackfill && (
                      <span className="ml-1 text-[10px] uppercase text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1">
                        {COPY.table.legacy}
                      </span>
                    )}
                    {row.needsReconciliation && (
                      <span className="ml-1 text-[10px] uppercase text-amber-600 border border-amber-300 dark:border-amber-700 rounded px-1">
                        Needs reconciliation
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[row.status] || ""}`}>
                      {row.status === "NO_SUBSCRIPTION" ? "Legacy" : row.status}
                    </span>
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

      {!error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setParam("page", String(Math.max(1, pagination.page - 1)))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            {COPY.prev}
          </button>
          <span className="text-gray-500">{COPY.pageOf(pagination.page, pagination.totalPages)}</span>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setParam("page", String(Math.min(pagination.totalPages, pagination.page + 1)))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            {COPY.next}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  warn,
  href,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  warn?: boolean;
  href?: string;
  active?: boolean;
  title?: string;
}) {
  const body = (
    <div
      title={title}
      className={`bg-white dark:bg-gray-800 rounded-xl border p-4 h-full ${
        active ? "border-zrp-red ring-1 ring-zrp-red" : "border-gray-200 dark:border-gray-700"
      } ${href ? "transition hover:border-zrp-red hover:shadow-sm cursor-pointer" : ""}`}
    >
      <div className={`flex items-center gap-2 text-xs mb-1 ${warn ? "text-amber-600" : "text-gray-500"}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
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
