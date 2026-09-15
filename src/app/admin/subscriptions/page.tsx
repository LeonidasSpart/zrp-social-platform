"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, TrendingUp, AlertTriangle, Users, DollarSign, RefreshCw, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import VerifiedBadge from "@/components/VerifiedBadge";

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
 *
 * Layout: the table below `md` is replaced by a card list (see
 * MobileUserCard) rather than the same 8-column table squeezed into a
 * phone width - a fixed-width table forced into a narrow viewport
 * doesn't scroll, it shrinks every column and wraps every word
 * character-by-character, which is what a real device screenshot showed
 * during this fix. The table itself also carries a `min-w` so the SAME
 * failure mode can't recur on a tablet-width viewport between the two
 * breakpoints - it scrolls horizontally past that width instead of
 * re-compressing.
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
    period: "Current period",
    daysRemaining: "Days left",
    lastPayment: "Last payment",
    reminder: "Reminder",
    actions: "Actions",
    legacy: "Legacy",
  },
  empty: "No subscriptions match these filters.",
  prev: "Previous",
  next: "Next",
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
  user: { id: string; username: string; email: string; name: string | null; plan: string; badgeType: string | null; avatarUrl?: string | null };
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

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "-";
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

  const hasActiveFilters = Boolean(search || plan !== "ALL" || status !== "ALL" || interval !== "ALL" || expiringWithin);

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
        {hasActiveFilters && (
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
        <>
          {/* Mobile / narrow tablet: a card list. A table forced into this
              width either scrolls (fine) or, without a min-width, shrinks
              every column and wraps every word - the latter is the exact
              defect a real device screenshot caught. Below `md` we don't
              give the table the chance to do that at all. */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <MobileUserCard key={row.userId} row={row} />
            ))}
          </div>

          {/* Desktop / tablet: the full table, with a guaranteed minimum
              width so it scrolls horizontally past this breakpoint
              instead of re-compressing, and a sticky first column so the
              user identity stays visible while scanning right. */}
          <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm min-w-[1040px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-4 py-3 min-w-[260px]">{COPY.table.user}</th>
                  <th className="px-4 py-3 min-w-[150px]">{COPY.table.plan}</th>
                  <th className="px-4 py-3 min-w-[110px]">{COPY.table.status}</th>
                  <th className="px-4 py-3 min-w-[180px]">{COPY.table.period}</th>
                  <th className="px-4 py-3 min-w-[90px] text-right">{COPY.table.daysRemaining}</th>
                  <th className="px-4 py-3 min-w-[170px]">{COPY.table.lastPayment}</th>
                  <th className="px-4 py-3 min-w-[100px]">{COPY.table.reminder}</th>
                  <th className="px-4 py-3 min-w-[90px] text-right">{COPY.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-4 py-3">
                      <UserCell user={row.user} />
                    </td>
                    <td className="px-4 py-3">
                      <PlanCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(row.currentPeriodStart)} &rarr; {formatDate(row.currentPeriodEnd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.daysRemaining ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      <LastPaymentCell row={row} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{row.reminderSentAt ? "Sent" : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/subscriptions/${row.userId}`}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-zrp-red hover:underline"
                      >
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-gray-500 dark:text-gray-400">
            Showing {(pagination.page - 1) * pagination.limit + 1}
            &ndash;{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setParam("page", String(Math.max(1, pagination.page - 1)))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            >
              {COPY.prev}
            </button>
            <span className="text-gray-500 dark:text-gray-400 px-1">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setParam("page", String(Math.min(pagination.totalPages, pagination.page + 1)))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            >
              {COPY.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Identity cell: a SINGLE <Link> wrapping avatar + name + username + email.
 * Deliberately not the shared AdminUserIdentity component here - that
 * component renders three separate internal <Link>s (fine for the review
 * queues it was built for), and this table used to wrap it in a second,
 * outer <Link> to the billing detail page. Nested <a> tags are invalid
 * HTML and produced a real, reproducible hydration error that left the
 * table rendering empty after certain navigations - see the fix history
 * in docs/subscriptions.md. One link, one destination (the profile);
 * billing detail gets its own explicit action in the Actions column.
 */
function UserCell({ user }: { user: SubscriptionRow["user"] }) {
  return (
    <Link href={`/profile/${user.username}`} className="flex items-center gap-3 min-w-0 group">
      <Avatar src={user.avatarUrl ?? null} alt="" name={user.name || user.username} className="h-10 w-10 text-sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-medium text-gray-900 dark:text-white truncate group-hover:underline">
            {user.name || user.username}
          </span>
          {user.badgeType && <VerifiedBadge badgeType={user.badgeType} className="shrink-0" />}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">@{user.username}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</div>
      </div>
    </Link>
  );
}

function PlanCell({ row }: { row: SubscriptionRow }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="capitalize font-medium text-gray-900 dark:text-white">{row.plan}</span>
      {row.billingInterval && <span className="text-xs text-gray-400 capitalize">{row.billingInterval.toLowerCase()}</span>}
      <div className="flex flex-wrap gap-1">
        {row.isLegacyBackfill && (
          <span className="text-[10px] uppercase text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-px">
            {COPY.table.legacy}
          </span>
        )}
        {row.needsReconciliation && (
          <span className="text-[10px] uppercase text-amber-600 border border-amber-300 dark:border-amber-700 rounded px-1 py-px">
            Needs reconciliation
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || ""}`}>
      {status === "NO_SUBSCRIPTION" ? "Legacy" : status}
    </span>
  );
}

function LastPaymentCell({ row }: { row: SubscriptionRow }) {
  if (!row.lastPayment) return <>-</>;
  return (
    <div className="flex flex-col">
      <span className="text-gray-700 dark:text-gray-300">${row.lastPayment.amount}</span>
      <span className="capitalize">{row.lastPayment.paymentMethod.replace(/_/g, " ")}</span>
      {row.lastPaymentAt && <span>{formatDate(row.lastPaymentAt)}</span>}
    </div>
  );
}

function MobileUserCard({ row }: { row: SubscriptionRow }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <UserCell user={row.user} />
        <StatusBadge status={row.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <div className="text-gray-400 dark:text-gray-500 mb-0.5">Plan</div>
          <PlanCell row={row} />
        </div>
        <div>
          <div className="text-gray-400 dark:text-gray-500 mb-0.5">Days left</div>
          <div className="text-gray-700 dark:text-gray-300 tabular-nums">{row.daysRemaining ?? "-"}</div>
        </div>
        <div className="col-span-2">
          <div className="text-gray-400 dark:text-gray-500 mb-0.5">Current period</div>
          <div className="text-gray-700 dark:text-gray-300">
            {formatDate(row.currentPeriodStart)} &rarr; {formatDate(row.currentPeriodEnd)}
          </div>
        </div>
        <div>
          <div className="text-gray-400 dark:text-gray-500 mb-0.5">Last payment</div>
          <div className="text-gray-700 dark:text-gray-300">
            <LastPaymentCell row={row} />
          </div>
        </div>
        <div>
          <div className="text-gray-400 dark:text-gray-500 mb-0.5">Reminder</div>
          <div className="text-gray-700 dark:text-gray-300">{row.reminderSentAt ? "Sent" : "-"}</div>
        </div>
      </div>
      <Link
        href={`/admin/subscriptions/${row.userId}`}
        className="mt-3 inline-flex items-center justify-center gap-1 w-full py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-zrp-red hover:bg-red-50 dark:hover:bg-red-900/10"
      >
        View billing detail <ChevronRight className="w-4 h-4" />
      </Link>
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
      className={`bg-white dark:bg-gray-800 rounded-xl border p-4 h-full transition ${
        active ? "border-zrp-red ring-1 ring-zrp-red" : "border-gray-200 dark:border-gray-700"
      } ${href ? "hover:border-zrp-red hover:shadow-sm cursor-pointer active:scale-[0.98]" : ""}`}
    >
      <div className={`flex items-center gap-2 text-xs mb-1 ${warn ? "text-amber-600" : "text-gray-500 dark:text-gray-400"}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block" aria-current={active ? "true" : undefined}>
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
