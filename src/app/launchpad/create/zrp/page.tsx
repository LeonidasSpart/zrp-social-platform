"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Loader2, Wallet, Rocket, Upload } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { createZrpTokenFromBrowser, AmbiguousZrpLaunchError } from "@/lib/launchpad/client-zrp-launch";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface InitialBuyQuote {
  status: string;
  tokenAmountRaw: string | null;
  feeLamports: string | null;
  minimumReceivedRaw: string | null;
}

function lamportsToSol(sol: string): bigint {
  const numeric = Number(sol || "0");
  if (!Number.isFinite(numeric) || numeric <= 0) return BigInt(0);
  return BigInt(Math.round(numeric * 1e9));
}

/*
 * ZRP-native token creation - mints through ZRP's own Launchpad program
 * (programs/zrp-launchpad/) exclusively, via client-zrp-launch.ts. This is
 * the single bonding-curve creation path; it does not call, construct, or
 * depend on Pump.fun's program in any way - see
 * docs/zrp-launchpad-deployment.md for the on-chain architecture this
 * mints against. Same shape as the ZRP direct-mint flow
 * (/launchpad/create), since this repo's established "connect wallet ->
 * sign -> broadcast -> record" UX pattern applies identically regardless
 * of which on-chain program a creation targets.
 */
export default function CreateZrpTokenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startUpload, isUploading } = useUploadThing("tokenImage");

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [initialBuySol, setInitialBuySol] = useState("");
  const [quote, setQuote] = useState<InitialBuyQuote | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "creating" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);
  // Set when the create (or create+buy) transaction broadcast but its
  // confirmation couldn't be verified (e.g. an RPC timeout) - mirrors
  // /launchpad/create's own ambiguousMint recovery UI exactly, since the
  // token may have already been created.
  const [ambiguousCreate, setAmbiguousCreate] = useState<{ mintAddress: string; signature: string } | null>(null);

  useEffect(() => {
    setQuote(null);
    const solLamports = lamportsToSol(initialBuySol);
    if (solLamports <= BigInt(0)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/launchpad/zrp/create-quote?solLamports=${solLamports.toString()}&slippageBps=100`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setQuote(data.quote ?? null))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initialBuySol]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    try {
      const result = await startUpload([file]);
      const uploaded = result?.[0];
      if (!uploaded?.ufsUrl) {
        setError(t("launchpad.createToken.imageUploadFailed"));
        return;
      }
      setImageUrl(uploaded.ufsUrl);
    } catch {
      setError(t("launchpad.createToken.imageUploadFailed"));
    }
  };

  const recordCreatedToken = async (mintAddress: string, signature: string, walletAddr: string) => {
    const response = await fetch("/api/launchpad/zrp/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim() || undefined,
        imageUrl,
        website: website.trim() || undefined,
        twitter: twitter.trim() || undefined,
        telegram: telegram.trim() || undefined,
        discord: discord.trim() || undefined,
        mintAddress,
        walletAddress: walletAddr,
        transactionId: signature,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const serverError = localizeApiMessage(data?.error, t) || t("launchpad.createToken.recordFailedDefault");
      throw new Error(t("launchpad.createToken.recordFailedWithMint", { error: serverError, mintAddress }));
    }

    router.push(`/launchpad/token/${mintAddress}`);
  };

  const handleFinishRecording = async () => {
    if (!ambiguousCreate || !walletAddress) return;
    setError(null);
    setStep("recording");
    try {
      await recordCreatedToken(ambiguousCreate.mintAddress, ambiguousCreate.signature, walletAddress);
      setAmbiguousCreate(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.createToken.recordFailedGeneric"));
    } finally {
      setStep("idle");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAmbiguousCreate(null);

    if (!name.trim() || name.trim().length > 32) {
      setError(t("launchpad.createToken.nameRequired"));
      return;
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      setError(t("launchpad.createToken.symbolRequired"));
      return;
    }
    if (!imageUrl) {
      setError(t("launchpad.createToken.imageRequired"));
      return;
    }
    if (!rpcUrl) {
      setError(t("launchpad.createToken.unavailable"));
      return;
    }

    const solLamports = lamportsToSol(initialBuySol);
    const wantsInitialBuy = solLamports > BigInt(0);
    if (wantsInitialBuy && (!quote || quote.status !== "OK" || !quote.tokenAmountRaw)) {
      setError(t("launchpad.zrpCreate.quoteUnavailable"));
      return;
    }

    try {
      setStep("creating");
      const result = await createZrpTokenFromBrowser({
        rpcUrl,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        metadataOrigin: window.location.origin,
        initialBuySolLamports: wantsInitialBuy ? solLamports : undefined,
        minTokensOut: wantsInitialBuy ? BigInt(quote!.minimumReceivedRaw!) : undefined,
      });
      setWalletAddress(result.walletAddress);

      setStep("recording");
      await recordCreatedToken(result.mintAddress, result.signature, result.walletAddress);
    } catch (err: unknown) {
      if (err instanceof AmbiguousZrpLaunchError) {
        setWalletAddress(err.walletAddress);
        if (err.mintAddress) {
          setAmbiguousCreate({ mintAddress: err.mintAddress, signature: err.signature });
        }
        setError(err.mintAddress ? null : err.message);
      } else {
        setError(err instanceof Error ? err.message : t("launchpad.createToken.createFailedGeneric"));
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
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.createToken.signInRequired")}</p>
      </div>
    );
  }

  const submitting = step !== "idle";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        <Rocket className="h-6 w-6" /> {t("launchpad.zrpCreate.heading")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.zrpCreate.intro")}</p>

      <form onSubmit={handleCreate} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.imageLabel")}</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || submitting}
            className="flex items-center gap-3 rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 hover:border-zrp-red transition disabled:opacity-50"
          >
            {imagePreview ? (
              <Image
                src={imagePreview}
                alt={t("launchpad.createToken.imagePreviewAlt")}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <Upload className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isUploading
                ? t("launchpad.createToken.uploadingLabel")
                : imageUrl
                  ? t("launchpad.createToken.changeImageLabel")
                  : t("launchpad.createToken.uploadImageHint")}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.nameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.symbolLabel")}</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.descriptionLabel")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            disabled={submitting}
            className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder={t("launchpad.createToken.websitePlaceholder")}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder={t("launchpad.createToken.twitterPlaceholder")}
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder={t("launchpad.createToken.telegramPlaceholder")}
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder={t("launchpad.createToken.discordPlaceholder")}
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.zrpCreate.initialBuyLabel")}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={initialBuySol}
            onChange={(e) => setInitialBuySol(e.target.value.replace(/[^\d.]/g, ""))}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("launchpad.zrpCreate.initialBuyHint")}</p>
          {quote && quote.status === "OK" && quote.tokenAmountRaw && (
            <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <p>
                {t("launchpad.curve.estimatedReceiveLabel")}: {(Number(quote.tokenAmountRaw) / 1e6).toLocaleString()}
              </p>
              <p>
                {t("launchpad.curve.feeLabel")}: {(Number(quote.feeLamports ?? "0") / 1e9).toLocaleString()} SOL
              </p>
              <p>
                {t("launchpad.curve.minReceivedLabel")}: {(Number(quote.minimumReceivedRaw ?? "0") / 1e6).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.zrpCreate.noFeeDisclaimer")}</p>
          {walletAddress && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Wallet className="h-3.5 w-3.5" /> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          )}
        </div>

        {ambiguousCreate && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">{t("launchpad.createToken.ambiguousMintTitle")}</p>
            <p className="mt-1 text-xs">
              {t("launchpad.createToken.mintAddressLabel")} <span className="font-mono break-all">{ambiguousCreate.mintAddress}</span>
            </p>
            <p className="mt-1 text-xs">{t("launchpad.createToken.ambiguousMintWarning")}</p>
            <button
              type="button"
              onClick={handleFinishRecording}
              disabled={submitting}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {step === "recording" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("launchpad.createToken.finishRecordingButton")}
            </button>
          </div>
        )}

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={submitting || isUploading || !!ambiguousCreate}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          {step === "creating" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("launchpad.createToken.confirmingWallet")}
            </>
          )}
          {step === "recording" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("launchpad.createToken.finishingUp")}
            </>
          )}
          {step === "idle" && (
            <>
              <Rocket className="h-4 w-4" />
              {t("launchpad.zrpCreate.submitButton")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
