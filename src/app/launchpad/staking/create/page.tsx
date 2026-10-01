"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  creator: { id: string } | null;
}

export default function CreateStakingPoolPage() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [launchedTokenId, setLaunchedTokenId] = useState("");
  const [apy, setApy] = useState("10");
  const [lockDays, setLockDays] = useState("0");
  const [minStake, setMinStake] = useState("1");
  const [maxStake, setMaxStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/launchpad/tokens?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.tokens || []).filter((t: OwnedToken) => t.creator?.id === session.user.id);
        setOwnedTokens(mine);
        if (mine.length > 0) setLaunchedTokenId(mine[0].id);
      })
      .catch(() => {});
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!launchedTokenId) {
      setError(t("launchpad.stakingCreate.errorSelectToken"));
      return;
    }
    const apyBasisPoints = Math.round(Number(apy) * 100);
    if (!Number.isFinite(apyBasisPoints) || apyBasisPoints < 0) {
      setError(t("launchpad.stakingCreate.errorInvalidApy"));
      return;
    }
    if (!/^\d+$/.test(minStake.trim())) {
      setError(t("launchpad.stakingCreate.errorInvalidMinStake"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/staking/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchedTokenId,
          apyBasisPoints,
          lockDays: Number(lockDays),
          minStake: minStake.trim(),
          maxStake: maxStake.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || t("launchpad.stakingCreate.errorCreateFailed"));
      router.push(`/launchpad/staking/${data.pool.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.stakingCreate.errorCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.stakingCreate.signInRequired")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.stakingCreate.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.stakingCreate.subtitle")}</p>

      {ownedTokens.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {t("launchpad.stakingCreate.noTokens")}{" "}
          <Link href="/launchpad/create" className="text-zrp-red hover:underline">
            {t("launchpad.stakingCreate.createTokenLink")}
          </Link>
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.stakingCreate.tokenLabel")}</label>
            <select
              value={launchedTokenId}
              onChange={(e) => setLaunchedTokenId(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {ownedTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (${t.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.stakingCreate.apyLabel")}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={apy}
                onChange={(e) => setApy(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.stakingCreate.lockDaysLabel")}</label>
              <input
                type="number"
                min={0}
                value={lockDays}
                onChange={(e) => setLockDays(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.stakingCreate.minStakeLabel")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={minStake}
                onChange={(e) => setMinStake(e.target.value.replace(/[^\d]/g, ""))}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.stakingCreate.maxStakeLabel")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={maxStake}
                onChange={(e) => setMaxStake(e.target.value.replace(/[^\d]/g, ""))}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("launchpad.stakingCreate.creating")}
              </>
            ) : (
              t("launchpad.stakingCreate.submit")
            )}
          </button>
        </form>
      )}
    </div>
  );
}
