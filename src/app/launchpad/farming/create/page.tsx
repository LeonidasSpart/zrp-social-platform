"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  creator: { id: string } | null;
}

export default function CreateFarmingPoolPage() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [lpMintAddress, setLpMintAddress] = useState("");
  const [lpTokenName, setLpTokenName] = useState("");
  const [lpTokenSymbol, setLpTokenSymbol] = useState("");
  const [lpDecimals, setLpDecimals] = useState("9");
  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [rewardTokenId, setRewardTokenId] = useState("");
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
        if (mine.length > 0) setRewardTokenId(mine[0].id);
      })
      .catch(() => {});
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!lpMintAddress.trim()) {
      setError(t("launchpad.farmingCreate.errMintAddressRequired"));
      return;
    }
    if (!lpTokenName.trim() || lpTokenName.trim().length > 32) {
      setError(t("launchpad.farmingCreate.errNameRequired"));
      return;
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(lpTokenSymbol.trim())) {
      setError(t("launchpad.farmingCreate.errSymbolRequired"));
      return;
    }
    if (!rewardTokenId) {
      setError(t("launchpad.farmingCreate.errRewardTokenRequired"));
      return;
    }
    const apyBasisPoints = Math.round(Number(apy) * 100);
    if (!Number.isFinite(apyBasisPoints) || apyBasisPoints < 0) {
      setError(t("launchpad.farmingCreate.errInvalidApy"));
      return;
    }
    if (!/^\d+$/.test(minStake.trim())) {
      setError(t("launchpad.farmingCreate.errInvalidMinStake"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/farming/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lpMintAddress: lpMintAddress.trim(),
          lpTokenName: lpTokenName.trim(),
          lpTokenSymbol: lpTokenSymbol.trim(),
          lpDecimals: Number(lpDecimals),
          rewardTokenId,
          apyBasisPoints,
          lockDays: Number(lockDays),
          minStake: minStake.trim(),
          maxStake: maxStake.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || t("launchpad.farmingCreate.errCreateFailed"));
      router.push(`/launchpad/farming/${data.pool.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.farmingCreate.errCreateFailed"));
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
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.farmingCreate.signInPrompt")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.farmingCreate.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("launchpad.farmingCreate.subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("launchpad.farmingCreate.mintAddressLabel")}
          </label>
          <input
            type="text"
            value={lpMintAddress}
            onChange={(e) => setLpMintAddress(e.target.value)}
            placeholder={t("launchpad.farmingCreate.mintAddressPlaceholder")}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.tokenNameLabel")}
            </label>
            <input
              type="text"
              value={lpTokenName}
              onChange={(e) => setLpTokenName(e.target.value)}
              maxLength={32}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.symbolLabel")}
            </label>
            <input
              type="text"
              value={lpTokenSymbol}
              onChange={(e) => setLpTokenSymbol(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.decimalsLabel")}
            </label>
            <input
              type="number"
              min={0}
              max={9}
              value={lpDecimals}
              onChange={(e) => setLpDecimals(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {ownedTokens.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("launchpad.farmingCreate.noOwnedTokens")}
          </p>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.rewardTokenLabel")}
            </label>
            <select
              value={rewardTokenId}
              onChange={(e) => setRewardTokenId(e.target.value)}
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.apyLabel")}
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.lockDaysLabel")}
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.minStakeLabel")}
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("launchpad.farmingCreate.maxStakeLabel")}
            </label>
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

        {error && (
          <div role="alert" aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || ownedTokens.length === 0}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("launchpad.farmingCreate.creating")}
            </>
          ) : (
            t("launchpad.farmingCreate.submitButton")
          )}
        </button>
      </form>
    </div>
  );
}
