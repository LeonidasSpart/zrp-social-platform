"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

// Per-user billing detail + admin controls (Step 7). Same deliberate
// English-only copy as the list page - see its comment for why.

interface Detail {
  user: { id: string; username: string; email: string; name: string | null; plan: string; badgeType: string | null; createdAt: string };
  subscription: {
    id: string;
    plan: string;
    status: string;
    billingInterval: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    daysRemaining: number | null;
    nextBillingAt: string | null;
    canceledAt: string | null;
    expiredAt: string | null;
    lastPaymentAt: string | null;
    reminderSentAt: string | null;
    isLegacyBackfill: boolean;
    payments: { id: string; plan: string; billingInterval: string; amount: number; currency: string; paymentMethod: string; periodStart: string; periodEnd: string; createdAt: string }[];
    events: { id: string; action: string; actorUsername: string | null; createdAt: string; metadata: unknown; prevState: unknown; newState: unknown }[];
  } | null;
  legacyPaymentRequests: { id: string; plan: string; amount: number; status: string; transactionId: string | null; createdAt: string }[];
  legacyUpgradeRequests: { id: string; requestedPlan: string; status: string; createdAt: string }[];
}

export default function AdminSubscriptionDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantPlan, setGrantPlan] = useState("pro");
  const [grantInterval, setGrantInterval] = useState("monthly");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscriptions/${userId}`);
      if (!res.ok) throw new Error("Failed to load subscription detail");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (path: string, body?: object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${userId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Action failed");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error || "Not found"}</div>;
  }

  const sub = data.subscription;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/subscriptions" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Subscriptions & Billing
      </Link>

      <div className="mb-6">
        <AdminUserIdentity user={data.user} extra={<span className="text-xs text-gray-400">{data.user.email}</span>} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">Current subscription</h2>
        {sub ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Plan" value={sub.plan} />
            <Field label="Status" value={sub.status} />
            <Field label="Interval" value={sub.billingInterval || "-"} />
            <Field label="Days remaining" value={sub.daysRemaining ?? "-"} />
            <Field label="Period start" value={sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleString() : "-"} />
            <Field label="Period end" value={sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleString() : "-"} />
            <Field label="Last payment" value={sub.lastPaymentAt ? new Date(sub.lastPaymentAt).toLocaleString() : "-"} />
            <Field label="Reminder sent" value={sub.reminderSentAt ? new Date(sub.reminderSentAt).toLocaleString() : "Not yet"} />
            <Field label="Canceled at" value={sub.canceledAt ? new Date(sub.canceledAt).toLocaleString() : "-"} />
            <Field label="Expired at" value={sub.expiredAt ? new Date(sub.expiredAt).toLocaleString() : "-"} />
            <Field label="Legacy backfill" value={sub.isLegacyBackfill ? "Yes" : "No"} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">No subscription record - this user has never had a paid entitlement tracked by this system.</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">Admin controls</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Plan</label>
            <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="pro">Pro</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Interval</label>
            <select value={grantInterval} onChange={(e) => setGrantInterval(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <button
            disabled={busy}
            onClick={() => runAction("grant", { plan: grantPlan, billingInterval: grantInterval })}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Grant / extend
          </button>
          {sub?.status === "ACTIVE" && (
            <button
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Reason for cancellation (optional):") || undefined;
                runAction("cancel", { reason });
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Cancel remaining time
            </button>
          )}
          {sub?.status === "CANCELED" && (
            <button
              disabled={busy}
              onClick={() => runAction("restore")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Restore
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          "Grant / extend" mirrors a real payment: it extends the user's existing period if one is
          still active for the same plan, otherwise it starts a fresh period from today. No money moves -
          it's recorded as an admin_grant in the payment history below.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">Payment history</h2>
        {sub && sub.payments.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Interval</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Period granted</th>
              </tr>
            </thead>
            <tbody>
              {sub.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 pr-3 text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3 capitalize">{p.plan}</td>
                  <td className="py-2 pr-3">{p.billingInterval}</td>
                  <td className="py-2 pr-3">
                    {p.amount} {p.currency}
                  </td>
                  <td className="py-2 pr-3">{p.paymentMethod}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {new Date(p.periodStart).toLocaleDateString()} &rarr; {new Date(p.periodEnd).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No payments recorded.</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">Billing audit log</h2>
        {sub && sub.events.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {sub.events.map((e) => (
              <li key={e.id} className="flex items-start justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2">
                <div>
                  <span className="font-medium">{e.action}</span>
                  {e.actorUsername && <span className="text-gray-400"> by {e.actorUsername}</span>}
                  {!e.actorUsername && <span className="text-gray-400"> (system)</span>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No billing events recorded yet.</p>
        )}
      </div>

      {(data.legacyPaymentRequests.length > 0 || data.legacyUpgradeRequests.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="font-semibold mb-3">Legacy manual requests</h2>
          <p className="text-xs text-gray-400 mb-3">
            Shown for context only - these no longer grant entitlement on their own; approving/verifying one
            now also creates the Subscription period above.
          </p>
          <ul className="space-y-1 text-sm">
            {data.legacyPaymentRequests.map((p) => (
              <li key={p.id} className="text-gray-600 dark:text-gray-300">
                PaymentRequest &middot; {p.plan} &middot; {p.amount} &middot; {p.status} &middot;{" "}
                {new Date(p.createdAt).toLocaleDateString()}
              </li>
            ))}
            {data.legacyUpgradeRequests.map((u) => (
              <li key={u.id} className="text-gray-600 dark:text-gray-300">
                UpgradeRequest &middot; {u.requestedPlan} &middot; {u.status} &middot;{" "}
                {new Date(u.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium capitalize">{value}</div>
    </div>
  );
}
