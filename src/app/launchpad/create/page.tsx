"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Loader2, Wallet, Rocket, Upload } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";
import { mintTokenFromBrowser, AmbiguousMintError } from "@/lib/launchpad/client-token-mint";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

// Kept in sync with the fee charged in
// src/app/api/launchpad/tokens/route.ts (TOKEN_CREATION_FEE_USDC). The
// server independently re-derives and verifies the exact amount
// on-chain - this constant only drives what the client builds into the
// transaction and what the form displays before the user signs.
const CREATION_FEE_USDC = 15;
const CREATION_FEE_RAW = BigInt(CREATION_FEE_USDC) * BigInt(1_000_000); // USDC has 6 decimals

export default function CreateTokenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";
  const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT || "";
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startUpload, isUploading } = useUploadThing("tokenImage");

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [supply, setSupply] = useState("1000000");
  const [decimals, setDecimals] = useState("9");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeFreeze, setRevokeFreeze] = useState(true);
  const [revokeUpdate, setRevokeUpdate] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "minting" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);
  // Set when the mint transaction broadcast but its confirmation
  // couldn't be verified (e.g. an RPC timeout) - the mint may have
  // already succeeded. Shown as a recovery action instead of a dead-end
  // error, so the user isn't tempted to resubmit the form and pay the
  // fee + mint a second token.
  const [ambiguousMint, setAmbiguousMint] = useState<{ mintAddress: string; signature: string } | null>(null);

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

  const recordMintedToken = async (mintAddress: string, signature: string) => {
    const response = await fetch("/api/launchpad/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...nativePaymentHeaders(isNativeApp()),
      },
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
    if (!ambiguousMint) return;
    setError(null);
    setStep("recording");
    try {
      await recordMintedToken(ambiguousMint.mintAddress, ambiguousMint.signature);
      setAmbiguousMint(null);
    } catch (err: unknown) {
      // The server independently re-verifies the mint on-chain before
      // ever recording it - if this still fails, the mint genuinely
      // didn't happen (or hasn't propagated to this RPC yet), so
      // surface the real error rather than silently clearing the
      // recovery state.
      setError(err instanceof Error ? err.message : t("launchpad.createToken.recordFailedGeneric"));
    } finally {
      setStep("idle");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAmbiguousMint(null);

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
    if (!/^[1-9]\d*$/.test(supply.trim())) {
      setError(t("launchpad.createToken.supplyInvalid"));
      return;
    }
    const numericDecimals = Number(decimals);
    if (!Number.isInteger(numericDecimals) || numericDecimals < 0 || numericDecimals > 9) {
      setError(t("launchpad.createToken.decimalsInvalid"));
      return;
    }
    if (!platformWallet || !usdcMint || !rpcUrl) {
      setError(t("launchpad.createToken.unavailable"));
      return;
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < numericDecimals; i += 1) decimalMultiplier *= BigInt(10);
    const rawSupply = BigInt(supply.trim()) * decimalMultiplier;

    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();

    try {
      setStep("minting");
      const mintResult = await mintTokenFromBrowser({
        rpcUrl,
        platformWalletAddress: platformWallet,
        usdcMintAddress: usdcMint,
        feeUsdcRawAmount: CREATION_FEE_RAW,
        decimals: numericDecimals,
        supply: rawSupply,
        name: cleanName,
        symbol: cleanSymbol,
        // Resolves dynamically from the DB row this same flow creates
        // right after - Solana never validates a metadata URI resolves
        // at mint time, only wallets/explorers fetch it later.
        metadataOrigin: window.location.origin,
        revokeMint,
        revokeFreeze,
        revokeUpdate,
      });
      setWalletAddress(mintResult.ownerWalletAddress);

      setStep("recording");
      await recordMintedToken(mintResult.mintAddress, mintResult.signature);
    } catch (err: unknown) {
      if (err instanceof AmbiguousMintError) {
        setAmbiguousMint({ mintAddress: err.mintAddress, signature: err.signature });
        setError(null);
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
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.createToken.heading")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("launchpad.createToken.intro", { fee: CREATION_FEE_USDC })}
      </p>

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
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.supplyLabel")}</label>
            <input
              type="text"
              inputMode="numeric"
              value={supply}
              onChange={(e) => setSupply(e.target.value.replace(/[^\d]/g, ""))}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.decimalsLabel")}</label>
            <input
              type="number"
              min={0}
              max={9}
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
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
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.createToken.authoritiesHeading")}</p>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeMint} onChange={(e) => setRevokeMint(e.target.checked)} disabled={submitting} />
            {t("launchpad.createToken.revokeMintLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeFreeze} onChange={(e) => setRevokeFreeze(e.target.checked)} disabled={submitting} />
            {t("launchpad.createToken.revokeFreezeLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeUpdate} onChange={(e) => setRevokeUpdate(e.target.checked)} disabled={submitting} />
            {t("launchpad.createToken.revokeUpdateLabel")}
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("launchpad.createToken.authorityHint")}</p>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("launchpad.createToken.feeDisclaimer", { fee: CREATION_FEE_USDC })}
          </p>
          {walletAddress && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Wallet className="h-3.5 w-3.5" /> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          )}
        </div>

        {ambiguousMint && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">{t("launchpad.createToken.ambiguousMintTitle")}</p>
            <p className="mt-1 text-xs">
              {t("launchpad.createToken.mintAddressLabel")} <span className="font-mono break-all">{ambiguousMint.mintAddress}</span>
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
          disabled={submitting || isUploading || !platformWallet || !!ambiguousMint}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          {step === "minting" && (
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
              {t("launchpad.createToken.submitButton", { fee: CREATION_FEE_USDC })}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
