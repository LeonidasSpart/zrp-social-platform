"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { findInjectedSolanaProvider } from "@/lib/launchpad/injected-wallet";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import type { TranslationKey } from "@/lib/translations";

interface ProposalDetail {
  id: string;
  title: string;
  description: string;
  proposerWalletAddress: string;
  votingEndsAt: string;
  forRaw: string;
  againstRaw: string;
  abstainRaw: string;
  status: "ACTIVE" | "PASSED" | "REJECTED" | "CANCELLED";
  dao: {
    id: string;
    name: string;
    quorumRaw: string;
    launchedToken: { name: string; symbol: string; imageUrl: string; decimals: number };
  };
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

async function connectWallet(t: (key: TranslationKey) => string): Promise<{ walletAddress: string }> {
  const provider = findInjectedSolanaProvider();
  if (!provider) {
    throw new Error(t("launchpad.daoProposalDetail.errorNoWalletInstall"));
  }
  const connected = await provider.connect();
  const publicKey = (connected && connected.publicKey) || provider.publicKey;
  const walletAddress = publicKey?.toString();
  if (!walletAddress) {
    throw new Error(t("launchpad.daoProposalDetail.errorNoWalletAddress"));
  }
  return { walletAddress };
}

async function signWithConnectedWallet(message: string, t: (key: TranslationKey) => string): Promise<string> {
  const provider = findInjectedSolanaProvider();
  if (!provider) {
    throw new Error(t("launchpad.daoProposalDetail.errorNoWallet"));
  }
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const signatureBytes = signed instanceof Uint8Array ? signed : signed?.signature;
  if (!(signatureBytes instanceof Uint8Array)) {
    throw new Error(t("launchpad.daoProposalDetail.errorNoSignature"));
  }
  const { default: bs58 } = await import("bs58");
  return bs58.encode(signatureBytes);
}

const STATUS_LABEL_KEYS: Record<ProposalDetail["status"], "launchpad.daoProposalDetail.statusActive" | "launchpad.daoProposalDetail.statusPassed" | "launchpad.daoProposalDetail.statusRejected" | "launchpad.daoProposalDetail.statusCancelled"> = {
  ACTIVE: "launchpad.daoProposalDetail.statusActive",
  PASSED: "launchpad.daoProposalDetail.statusPassed",
  REJECTED: "launchpad.daoProposalDetail.statusRejected",
  CANCELLED: "launchpad.daoProposalDetail.statusCancelled",
};

export default function DaoProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLanguage();
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const loadProposal = async () => {
    const res = await fetch(`/api/launchpad/dao/proposals/${params.id}`);
    const data = await res.json().catch(() => null);
    setProposal(res.ok ? data?.proposal ?? null : null);
  };

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    loadProposal().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleVote = async (choice: "FOR" | "AGAINST" | "ABSTAIN") => {
    if (!proposal) return;
    setError(null);
    setResultMessage(null);
    setBusy(choice);
    try {
      const { walletAddress } = await connectWallet(t);

      const challengeRes = await fetch(`/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const challenge = await challengeRes.json().catch(() => null);
      if (!challengeRes.ok || typeof challenge?.message !== "string") {
        throw new Error(localizeApiMessage(challenge?.error, t) || t("launchpad.daoProposalDetail.errorVoteChallengeFailed"));
      }

      const signature = await signWithConnectedWallet(challenge.message, t);

      const voteRes = await fetch(`/api/launchpad/dao/proposals/${proposal.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, choice }),
      });
      const voteData = await voteRes.json().catch(() => null);
      if (!voteRes.ok) throw new Error(localizeApiMessage(voteData?.error, t) || t("launchpad.daoProposalDetail.errorVoteFailed"));

      const choiceLabelKey =
        choice === "FOR"
          ? "launchpad.daoProposalDetail.choiceFor"
          : choice === "AGAINST"
            ? "launchpad.daoProposalDetail.choiceAgainst"
            : "launchpad.daoProposalDetail.choiceAbstain";
      setResultMessage(
        t("launchpad.daoProposalDetail.votedWith", {
          choice: t(choiceLabelKey),
          amount: formatRaw(voteData.weight, proposal.dao.launchedToken.decimals),
        })
      );
      await loadProposal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.daoProposalDetail.errorVoteFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!proposal) return;
    setError(null);
    setResultMessage(null);
    setBusy("cancel");
    try {
      const { walletAddress } = await connectWallet(t);

      const challengeRes = await fetch(`/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const challenge = await challengeRes.json().catch(() => null);
      if (!challengeRes.ok || typeof challenge?.message !== "string") {
        throw new Error(localizeApiMessage(challenge?.error, t) || t("launchpad.daoProposalDetail.errorChallengeFailed"));
      }

      const signature = await signWithConnectedWallet(challenge.message, t);

      const cancelRes = await fetch(`/api/launchpad/dao/proposals/${proposal.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature }),
      });
      const cancelData = await cancelRes.json().catch(() => null);
      if (!cancelRes.ok) throw new Error(localizeApiMessage(cancelData?.error, t) || t("launchpad.daoProposalDetail.errorCancelFailed"));

      setResultMessage(t("launchpad.daoProposalDetail.resultCancelled"));
      await loadProposal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.daoProposalDetail.errorCancelFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!proposal) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.daoProposalDetail.notFound")}</p>
      </div>
    );
  }

  const decimals = proposal.dao.launchedToken.decimals;
  const canVote = proposal.status === "ACTIVE";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Link href={`/launchpad/dao/${proposal.dao.id}`} className="text-xs text-gray-500 hover:text-zrp-red transition">
        &larr; {proposal.dao.name}
      </Link>

      <div className="flex items-start gap-3">
        <Image
          src={proposal.dao.launchedToken.imageUrl}
          alt={proposal.dao.launchedToken.name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          unoptimized
        />
        <div>
          <h1 className="text-xl font-extrabold font-orbitron text-gray-900 dark:text-white">{proposal.title}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("launchpad.daoProposalDetail.proposedBy", {
              address: `${proposal.proposerWalletAddress.slice(0, 6)}...${proposal.proposerWalletAddress.slice(-4)}`,
            })}
          </p>
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{proposal.description}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.daoProposalDetail.forLabel")}</p>
          <p className="font-semibold text-green-600 dark:text-green-400">{formatRaw(proposal.forRaw, decimals)}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.daoProposalDetail.againstLabel")}</p>
          <p className="font-semibold text-red-600 dark:text-red-400">{formatRaw(proposal.againstRaw, decimals)}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.daoProposalDetail.abstainLabel")}</p>
          <p className="font-semibold text-gray-600 dark:text-gray-400">{formatRaw(proposal.abstainRaw, decimals)}</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {proposal.status === "ACTIVE"
          ? t("launchpad.daoProposalDetail.votingEndsAt", { date: new Date(proposal.votingEndsAt).toLocaleString() })
          : t("launchpad.daoProposalDetail.statusLabel", { status: t(STATUS_LABEL_KEYS[proposal.status]) })}
      </p>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}
      {resultMessage && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">{resultMessage}</div>
      )}

      {canVote && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.daoProposalDetail.connectHint")}</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleVote("FOR")}
              disabled={busy !== null}
              className="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy === "FOR" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.daoProposalDetail.voteForButton")}
            </button>
            <button
              type="button"
              onClick={() => handleVote("AGAINST")}
              disabled={busy !== null}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "AGAINST" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.daoProposalDetail.voteAgainstButton")}
            </button>
            <button
              type="button"
              onClick={() => handleVote("ABSTAIN")}
              disabled={busy !== null}
              className="inline-flex items-center justify-center rounded-md bg-gray-900 dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "ABSTAIN" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.daoProposalDetail.abstainLabel")}
            </button>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy !== null}
            className="w-full text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-50"
          >
            {busy === "cancel" ? t("launchpad.daoProposalDetail.cancellingButton") : t("launchpad.daoProposalDetail.cancelProposerButton")}
          </button>
        </div>
      )}
    </div>
  );
}
