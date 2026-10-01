"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Loader2, Copy, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface PoolDetail {
  id: string;
  collectionName: string;
  rewardRatePerDayRaw: string;
  lockSeconds: number;
  rewardReserveRaw: string;
  creatorId: string | null;
  rewardToken: { name: string; symbol: string; imageUrl: string; decimals: number };
}

function formatRaw(raw: string, decimals: number): string {
  try {
    const value = BigInt(raw);
    if (decimals === 0) return value.toLocaleString();
    let divisor = BigInt(1);
    for (let i = 0; i < decimals; i += 1) divisor *= BigInt(10);
    return (value / divisor).toLocaleString();
  } catch {
    return raw;
  }
}

export default function NftStakingPoolDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { data: session } = useSession();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";

  const [pool, setPool] = useState<PoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Stake form
  const [nftMint, setNftMint] = useState("");
  const [stakeWallet, setStakeWallet] = useState("");
  const [stakeTx, setStakeTx] = useState("");
  const [staking, setStaking] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [stakeSuccess, setStakeSuccess] = useState<string | null>(null);

  // Fund form (creator only)
  const [fundAmount, setFundAmount] = useState("");
  const [fundTx, setFundTx] = useState("");
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    loadPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const loadPool = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/nft-staking/pools/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setPool(data.pool);
      }
    } catch {
      // handled by pool staying null below
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!platformWallet) return;
    try {
      await navigator.clipboard.writeText(platformWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the address is still visible.
    }
  };

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    setStakeError(null);
    setStakeSuccess(null);
    if (!pool) return;
    if (!nftMint.trim()) {
      setStakeError(t("launchpad.nftStakingDetail.errPasteNftMint"));
      return;
    }
    if (!stakeWallet.trim()) {
      setStakeError(t("launchpad.nftStakingDetail.errWalletRequired"));
      return;
    }
    if (!stakeTx.trim()) {
      setStakeError(t("launchpad.nftStakingDetail.errPasteDepositTx"));
      return;
    }
    setStaking(true);
    try {
      const nftRes = await fetch(`/api/launchpad/nfts/${nftMint.trim()}`);
      const nftData = await nftRes.json().catch(() => null);
      if (!nftRes.ok || !nftData?.nft?.id) {
        throw new Error(t("launchpad.nftStakingDetail.errNftNotFound"));
      }

      const res = await fetch("/api/launchpad/nft-staking/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: pool.id,
          nftId: nftData.nft.id,
          walletAddress: stakeWallet.trim(),
          depositTransactionId: stakeTx.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.nftStakingDetail.errOpenPositionFailed"));
      setStakeSuccess(t("launchpad.nftStakingDetail.stakeSuccess"));
      setNftMint("");
      setStakeTx("");
    } catch (err: unknown) {
      setStakeError(err instanceof Error ? err.message : t("launchpad.nftStakingDetail.errOpenPositionFailed"));
    } finally {
      setStaking(false);
    }
  };

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault();
    setFundError(null);
    if (!pool) return;
    if (!/^[1-9]\d*$/.test(fundAmount.trim())) {
      setFundError(t("launchpad.nftStakingDetail.errAmountPositiveWhole"));
      return;
    }
    if (!fundTx.trim()) {
      setFundError(t("launchpad.nftStakingDetail.errPasteFundingTx"));
      return;
    }
    setFunding(true);
    try {
      const res = await fetch(`/api/launchpad/nft-staking/pools/${pool.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fundAmount.trim(), transactionId: fundTx.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.nftStakingDetail.errFundFailed"));
      setPool(data.pool);
      setFundAmount("");
      setFundTx("");
    } catch (err: unknown) {
      setFundError(err instanceof Error ? err.message : t("launchpad.nftStakingDetail.errFundFailed"));
    } finally {
      setFunding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!pool) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.nftStakingDetail.poolNotFound")}</p>
      </div>
    );
  }

  const isCreator = session?.user?.id === pool.creatorId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{pool.collectionName}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t("launchpad.nftStakingDetail.subtitlePoolType")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.nftStakingDetail.rewardPerNftDayLabel")}</p>
          <div className="flex items-center gap-2 mt-1">
            <Image src={pool.rewardToken.imageUrl} alt={pool.rewardToken.name} width={20} height={20} className="w-5 h-5 rounded-full object-cover" unoptimized />
            <p className="font-bold text-green-600 dark:text-green-400">
              {formatRaw(pool.rewardRatePerDayRaw, pool.rewardToken.decimals)} {pool.rewardToken.symbol}
            </p>
          </div>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.nftStakingDetail.lockPeriodLabel")}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {pool.lockSeconds === 0
              ? t("launchpad.nftStakingDetail.lockNone")
              : t("launchpad.nftStakingDetail.lockDaysValue", { days: Math.round(pool.lockSeconds / 86400) })}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 col-span-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.nftStakingDetail.rewardReserveLabel")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatRaw(pool.rewardReserveRaw, pool.rewardToken.decimals)} {pool.rewardToken.symbol}
          </p>
        </div>
      </div>

      <form onSubmit={handleStake} className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t("launchpad.nftStakingDetail.stakeSectionTitle")}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("launchpad.nftStakingDetail.stakeInstructions")}
        </p>
        {platformWallet && (
          <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
            <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
            <button type="button" onClick={handleCopyAddress} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
        <input
          type="text"
          placeholder={t("launchpad.nftStakingDetail.nftMintPlaceholder")}
          value={nftMint}
          onChange={(e) => setNftMint(e.target.value)}
          disabled={staking}
          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder={t("launchpad.nftStakingDetail.walletAddressPlaceholder")}
          value={stakeWallet}
          onChange={(e) => setStakeWallet(e.target.value)}
          disabled={staking}
          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder={t("launchpad.nftStakingDetail.depositTxPlaceholder")}
          value={stakeTx}
          onChange={(e) => setStakeTx(e.target.value)}
          disabled={staking}
          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        {stakeError && <p className="text-sm text-red-600 dark:text-red-400">{stakeError}</p>}
        {stakeSuccess && <p className="text-sm text-green-600 dark:text-green-400">{stakeSuccess}</p>}
        <button
          type="submit"
          disabled={staking}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {staking ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.nftStakingDetail.stakeButton")}
        </button>
      </form>

      {isCreator && (
        <form onSubmit={handleFund} className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("launchpad.nftStakingDetail.fundSectionTitle")}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.nftStakingDetail.fundInstructions")}</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder={t("launchpad.nftStakingDetail.amountPlaceholder")}
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value.replace(/[^\d]/g, ""))}
              disabled={funding}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <input
              type="text"
              placeholder={t("launchpad.nftStakingDetail.depositTxPlaceholder")}
              value={fundTx}
              onChange={(e) => setFundTx(e.target.value)}
              disabled={funding}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {fundError && <p className="text-sm text-red-600 dark:text-red-400">{fundError}</p>}
          <button
            type="submit"
            disabled={funding}
            className="w-full inline-flex items-center justify-center rounded-md bg-gray-900 dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.nftStakingDetail.fundButton")}
          </button>
        </form>
      )}
    </div>
  );
}
