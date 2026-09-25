"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import { buttonClasses } from "@/components/ui/styles";

/*
 * Proves ownership of a Solana wallet so withdrawals can be paid to it.
 *
 * Creator and HELP withdrawals only ever pay User.verifiedSolanaWallet
 * (see /api/creator/withdraw, /api/help/[id]/withdraw), which is set
 * exclusively by /api/wallet/link-verify after checking an ed25519
 * signature over a server-issued, single-use challenge. Nothing on any
 * platform used to drive that flow, so every withdrawal was refused.
 *
 * No wallet-adapter dependency (see the note at the top of TipModal):
 * this talks to the standard injected provider that Phantom, Solflare
 * and Backpack expose (desktop extensions and their in-app mobile
 * browsers). Signing a message never authorizes a transaction.
 */

interface InjectedSolanaProvider {
  connect: () => Promise<{ publicKey?: { toString(): string } } | void>;
  publicKey?: { toString(): string } | null;
  signMessage: (
    message: Uint8Array,
    display?: string
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
}

function findProvider(): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    backpack?: InjectedSolanaProvider;
    solana?: InjectedSolanaProvider;
  };
  const candidates = [w.phantom?.solana, w.solflare, w.backpack, w.solana];
  return candidates.find((p) => p && typeof p.signMessage === "function" && typeof p.connect === "function") ?? null;
}

function shorten(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
}

export default function WalletVerifyPanel({
  onVerifiedChange,
  compact = false,
}: {
  onVerifiedChange?: (wallet: string | null) => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const verified = typeof data?.verifiedSolanaWallet === "string" ? data.verifiedSolanaWallet : null;
        setWallet(verified);
        onVerifiedChange?.(verified);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Load once per mount; onVerifiedChange is a notification, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    setError(null);
    setSuccess(false);
    const provider = findProvider();
    if (!provider) {
      setError(t("walletVerify.noProvider"));
      return;
    }

    setBusy(true);
    try {
      const challengeRes = await fetch("/api/wallet/link-challenge", { method: "POST" });
      const challenge = await challengeRes.json().catch(() => ({}));
      if (!challengeRes.ok || typeof challenge.message !== "string") {
        throw new Error(localizeApiMessage(challenge.error, t) || t("walletVerify.failed"));
      }

      const connected = await provider.connect();
      const publicKey = (connected && connected.publicKey) || provider.publicKey;
      const walletAddress = publicKey?.toString();
      if (!walletAddress) throw new Error(t("walletVerify.failed"));

      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const signatureBytes = signed instanceof Uint8Array ? signed : signed?.signature;
      if (!(signatureBytes instanceof Uint8Array)) throw new Error(t("walletVerify.failed"));

      const verifyRes = await fetch("/api/wallet/link-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature: bs58.encode(signatureBytes) }),
      });
      const verified = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(localizeApiMessage(verified.error, t) || t("walletVerify.failed"));
      }

      setWallet(walletAddress);
      setSuccess(true);
      onVerifiedChange?.(walletAddress);
    } catch (err: unknown) {
      // A user closing the wallet's approval prompt rejects with a
      // provider error; show the generic, localized failure for it.
      const message = err instanceof Error && err.message ? err.message : "";
      setError(message && !/reject|denied|cancel/i.test(message) ? message : t("walletVerify.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("walletVerify.title")}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("walletVerify.desc")}</p>
        </>
      )}

      {!loaded ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-hidden="true" />
      ) : wallet ? (
        <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
          <span>{t("walletVerify.verified")}:</span>
          <code className="font-mono text-xs break-all" title={wallet}>
            {shorten(wallet)}
          </code>
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("walletVerify.none")}</p>
      )}

      {loaded && (
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className={buttonClasses({ variant: "secondary", fullWidth: !compact })}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 me-2 animate-spin" aria-hidden="true" />
              {t("walletVerify.linking")}
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 me-2" aria-hidden="true" />
              {wallet ? t("walletVerify.relink") : t("walletVerify.link")}
            </>
          )}
        </button>
      )}

      <div aria-live="polite">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{t("walletVerify.success")}</p>}
      </div>
    </div>
  );
}
