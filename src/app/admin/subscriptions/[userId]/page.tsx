"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";
import { useLanguage } from "@/contexts/LanguageContext";

// Per-user billing detail + admin controls (Step 7).

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
  const { t } = useLanguage();
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
      if (!res.ok) throw new Error(t("adminSubscriptionDetail.loadFailed"));
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminSubscriptionDetail.somethingWrong"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        throw new Error(err.error || t("adminSubscriptionDetail.actionFailed"));
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("adminSubscriptionDetail.actionFailed"));
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
    return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error || t("adminSubscriptionDetail.notFound")}</div>;
  }

  const sub = data.subscription;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/subscriptions" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> {t("adminSubscriptionDetail.backToList")}
      </Link>

      <div className="mb-6">
        <AdminUserIdentity user={data.user} extra={<span className="text-xs text-gray-400">{data.user.email}</span>} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">{t("adminSubscriptionDetail.currentSubscription")}</h2>
        {sub ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label={t("adminSubscriptionDetail.fieldPlan")} value={sub.plan} />
            <Field label={t("adminSubscriptionDetail.fieldStatus")} value={sub.status} />
            <Field label={t("adminSubscriptionDetail.fieldInterval")} value={sub.billingInterval || "-"} />
            <Field label={t("adminSubscriptionDetail.fieldDaysRemaining")} value={sub.daysRemaining ?? "-"} />
            <Field label={t("adminSubscriptionDetail.fieldPeriodStart")} value={sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleString() : "-"} />
            <Field label={t("adminSubscriptionDetail.fieldPeriodEnd")} value={sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleString() : "-"} />
            <Field label={t("adminSubscriptionDetail.fieldLastPayment")} value={sub.lastPaymentAt ? new Date(sub.lastPaymentAt).toLocaleString() : "-"} />
            <Field label={t("adminSubscriptionDetail.fieldReminderSent")} value={sub.reminderSentAt ? new Date(sub.reminderSentAt).toLocaleString() : t("adminSubscriptionDetail.notYet")} />
            <Field label={t("adminSubscriptionDetail.fieldCanceledAt")} value={sub.canceledAt ? new Date(sub.canceledAt).toLocaleString() : "-"} />
            <Field label={t("adminSubscriptionDetail.fieldExpiredAt")} value={sub.expiredAt ? new Date(sub.expiredAt).toLocaleString() : "-"} />
            <Field label={t("adminSubscriptionDetail.fieldLegacyBackfill")} value={sub.isLegacyBackfill ? t("adminSubscriptionDetail.yes") : t("adminSubscriptionDetail.no")} />
          </div>
        ) : data.user.plan !== "free" ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {t("adminSubscriptionDetail.needsReconciliationNote", {
              planField: "User.plan",
              plan: data.user.plan,
              script: "scripts/backfill-subscriptions.ts",
            })}
          </p>
        ) : (
          <p className="text-sm text-gray-500">{t("adminSubscriptionDetail.noSubscriptionRecord")}</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">{t("adminSubscriptionDetail.adminControls")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("adminSubscriptionDetail.planLabel")}</label>
            <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="pro">{t("adminSubscriptionDetail.planPro")}</option>
              <option value="business">{t("adminSubscriptionDetail.planBusiness")}</option>
              <option value="enterprise">{t("adminSubscriptionDetail.planEnterprise")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("adminSubscriptionDetail.intervalLabel")}</label>
            <select value={grantInterval} onChange={(e) => setGrantInterval(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="monthly">{t("adminSubscriptionDetail.intervalMonthly")}</option>
              <option value="yearly">{t("adminSubscriptionDetail.intervalYearly")}</option>
            </select>
          </div>
          <button
            disabled={busy}
            onClick={() => runAction("grant", { plan: grantPlan, billingInterval: grantInterval })}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {t("adminSubscriptionDetail.grantExtend")}
          </button>
          {sub?.status === "ACTIVE" && (
            <button
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(t("adminSubscriptionDetail.cancelReasonPrompt")) || undefined;
                runAction("cancel", { reason });
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {t("adminSubscriptionDetail.cancelRemaining")}
            </button>
          )}
          {sub?.status === "CANCELED" && (
            <button
              disabled={busy}
              onClick={() => runAction("restore")}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {t("adminSubscriptionDetail.restore")}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          {t("adminSubscriptionDetail.grantExtendNote")}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">{t("adminSubscriptionDetail.paymentHistory")}</h2>
        {sub && sub.payments.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colDate")}</th>
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colPlan")}</th>
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colInterval")}</th>
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colAmount")}</th>
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colMethod")}</th>
                <th className="py-2 pr-3">{t("adminSubscriptionDetail.colPeriodGranted")}</th>
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
          <p className="text-sm text-gray-500">{t("adminSubscriptionDetail.noPayments")}</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="font-semibold mb-3">{t("adminSubscriptionDetail.billingAuditLog")}</h2>
        {sub && sub.events.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {sub.events.map((e) => (
              <li key={e.id} className="flex items-start justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2">
                <div>
                  <span className="font-medium">{e.action}</span>
                  {e.actorUsername && <span className="text-gray-400"> {t("adminSubscriptionDetail.actorBy", { username: e.actorUsername })}</span>}
                  {!e.actorUsername && <span className="text-gray-400"> {t("adminSubscriptionDetail.actorSystem")}</span>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{t("adminSubscriptionDetail.noBillingEvents")}</p>
        )}
      </div>

      {(data.legacyPaymentRequests.length > 0 || data.legacyUpgradeRequests.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="font-semibold mb-3">{t("adminSubscriptionDetail.legacyRequests")}</h2>
          <p className="text-xs text-gray-400 mb-3">
            {t("adminSubscriptionDetail.legacyRequestsNote")}
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
