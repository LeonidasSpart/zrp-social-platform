"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Droplets } from "lucide-react";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import { createPoolFromBrowser, AmbiguousLiquidityError } from "@/lib/launchpad/client-liquidity";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface ScanResult {
  mintAddress: string;
  tokenProgram: "TOKEN_PROGRAM" | "TOKEN_2022_PROGRAM";
  decimals: number;
  metadata: { name: string; symbol: string } | null;
}

function CreatePoolForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
  const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT || "";

  const mintParam = searchParams.get("mint") || "";
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [quoteAsset, setQuoteAsset] = useState<"SOL" | "USDC">("SOL");
  const [tokenAmount, setTokenAmount] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [step, setStep] = useState<"idle" | "creating" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ signature: string; walletAddress: string } | null>(null);

  useEffect(() => {
    if (!mintParam) return;
    fetch(`/api/launchpad/scanner/${mintParam}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.scanner.scanFailed"));
        return data.scan as ScanResult;
      })
      .then(setScan)
      .catch((err: unknown) => setScanError(err instanceof Error ? err.message : t("launchpad.scanner.scanFailed")));
  }, [mintParam, t]);

  const handleFinishRecording = async (signature: string, tokenProgramId: string, walletAddress: string) => {
    setStep("recording");
    try {
      const res = await fetch("/api/launchpad/pools/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMintAddress: mintParam,
          tokenProgramId,
          quoteMintAddress: quoteAsset === "SOL" ? NATIVE_MINT.toBase58() : usdcMint,
          creatorWalletAddress: walletAddress,
          transactionId: signature,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok && res.status !== 200) {
        throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.pool.createFailedGeneric"));
      }
      setAmbiguous(null);
      router.push(`/launchpad/token/${mintParam}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
    } finally {
      setStep("idle");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!scan || !rpcUrl) {
      setError(t("launchpad.pool.unavailable"));
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(tokenAmount) || Number(tokenAmount) <= 0) {
      setError(t("launchpad.pool.createFailedGeneric"));
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(quoteAmount) || Number(quoteAmount) <= 0) {
      setError(t("launchpad.pool.createFailedGeneric"));
      return;
    }

    const tokenProgramId = (scan.tokenProgram === "TOKEN_2022_PROGRAM" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID).toBase58();
    let tokenDecimalMultiplier = BigInt(1);
    for (let i = 0; i < scan.decimals; i += 1) tokenDecimalMultiplier *= BigInt(10);
    const [tokenWhole, tokenFrac = ""] = tokenAmount.split(".");
    const tokenRaw =
      BigInt(tokenWhole || "0") * tokenDecimalMultiplier +
      BigInt((tokenFrac + "0".repeat(scan.decimals)).slice(0, scan.decimals) || "0");

    const quoteDecimals = quoteAsset === "SOL" ? 9 : 6;
    let quoteDecimalMultiplier = BigInt(1);
    for (let i = 0; i < quoteDecimals; i += 1) quoteDecimalMultiplier *= BigInt(10);
    const [quoteWhole, quoteFrac = ""] = quoteAmount.split(".");
    const quoteRaw =
      BigInt(quoteWhole || "0") * quoteDecimalMultiplier +
      BigInt((quoteFrac + "0".repeat(quoteDecimals)).slice(0, quoteDecimals) || "0");

    try {
      setStep("creating");
      const result = await createPoolFromBrowser({
        rpcUrl,
        tokenMintAddress: mintParam,
        tokenProgramId,
        tokenRawAmount: tokenRaw,
        quoteMintAddress: quoteAsset === "SOL" ? NATIVE_MINT.toBase58() : usdcMint,
        quoteRawAmount: quoteRaw,
        quoteIsNativeSol: quoteAsset === "SOL",
      });
      await handleFinishRecording(result.signature, tokenProgramId, result.walletAddress);
    } catch (err: unknown) {
      if (err instanceof AmbiguousLiquidityError) {
        setAmbiguous({ signature: err.signature, walletAddress: err.walletAddress });
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
      }
    } finally {
      setStep("idle");
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
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.pool.signInRequired")}</p>
      </div>
    );
  }
  if (!mintParam) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.tokenDetail.notFound")}</p>
      </div>
    );
  }

  const submitting = step !== "idle";

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">
        <Droplets className="h-6 w-6" /> {t("launchpad.pool.createHeading")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.pool.createIntro")}</p>

      {scanError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{scanError}</div>}

      {scan && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.pool.tokenMintLabel")}</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {scan.metadata ? `${scan.metadata.name} ($${scan.metadata.symbol})` : scan.mintAddress}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.pool.quoteAssetLabel")}</label>
            <div className="flex gap-2">
              {(["SOL", "USDC"] as const).map((asset) => (
                <button
                  key={asset}
                  type="button"
                  onClick={() => setQuoteAsset(asset)}
                  disabled={submitting}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    quoteAsset === asset ? "border-zrp-red bg-red-50 dark:bg-red-950/20" : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  {asset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.pool.tokenAmountLabel")}</label>
              <input
                type="text"
                inputMode="decimal"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value.replace(/[^\d.]/g, ""))}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.pool.quoteAmountLabel")}</label>
              <input
                type="text"
                inputMode="decimal"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value.replace(/[^\d.]/g, ""))}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {ambiguous && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-medium">{t("launchpad.pool.ambiguousTitle")}</p>
              <p className="mt-1 text-xs">{t("launchpad.pool.ambiguousBody")}</p>
              <p className="mt-1 font-mono text-xs break-all">{ambiguous.signature}</p>
              <button
                type="button"
                onClick={() => {
                  const tokenProgramId = (scan.tokenProgram === "TOKEN_2022_PROGRAM" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID).toBase58();
                  void handleFinishRecording(ambiguous.signature, tokenProgramId, ambiguous.walletAddress);
                }}
                disabled={submitting}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {step === "recording" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("launchpad.pool.confirmButton")}
              </button>
            </div>
          )}

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={submitting || !!ambiguous}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {step === "creating" ? t("launchpad.pool.creatingLabel") : t("launchpad.createToken.finishingUp")}
              </>
            ) : (
              <>
                <Droplets className="h-4 w-4" />
                {t("launchpad.pool.createButton")}
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function CreatePoolPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
        </div>
      }
    >
      <CreatePoolForm />
    </Suspense>
  );
}
