"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Loader2, Copy, Check, Upload } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";

// Kept in sync with the fee charged in
// src/app/api/launchpad/tokens/route.ts (TOKEN_CREATION_FEE_USDC). The
// server independently verifies the exact amount on-chain - this constant
// is only what the form displays to the user before they pay.
const CREATION_FEE_USDC = 15;

export default function CreateTokenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";
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
  const [transactionId, setTransactionId] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    try {
      const result = await startUpload([file]);
      const uploaded = result?.[0];
      if (!uploaded?.ufsUrl) {
        setError("Image upload failed. Please try again.");
        return;
      }
      setImageUrl(uploaded.ufsUrl);
    } catch {
      setError("Image upload failed. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length > 32) {
      setError("Name is required (max 32 characters).");
      return;
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      setError("Symbol is required (max 10 letters/numbers, no spaces).");
      return;
    }
    if (!imageUrl) {
      setError("Please upload a token image.");
      return;
    }
    if (!/^[1-9]\d*$/.test(supply.trim())) {
      setError("Supply must be a positive whole number.");
      return;
    }
    const numericDecimals = Number(decimals);
    if (!Number.isInteger(numericDecimals) || numericDecimals < 0 || numericDecimals > 9) {
      setError("Decimals must be between 0 and 9.");
      return;
    }
    if (!transactionId.trim()) {
      setError("Paste the transaction ID for the creation fee payment.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...nativePaymentHeaders(isNativeApp()),
        },
        body: JSON.stringify({
          name: name.trim(),
          symbol: symbol.trim(),
          description: description.trim() || undefined,
          imageUrl,
          supply: supply.trim(),
          decimals: numericDecimals,
          website: website.trim() || undefined,
          twitter: twitter.trim() || undefined,
          telegram: telegram.trim() || undefined,
          discord: discord.trim() || undefined,
          revokeMint,
          revokeFreeze,
          revokeUpdate,
          transactionId: transactionId.trim(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create token.");
      }
      if (!data?.success || !data?.token?.mintAddress) {
        throw new Error(data?.token?.failureReason || "The mint transaction did not complete. Contact support with your fee transaction ID.");
      }

      router.push(`/launchpad/token/${data.token.mintAddress}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create token.");
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
        <p className="text-gray-600 dark:text-gray-400">Sign in to create a token.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Create a token</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Mints a real SPL token on Solana mainnet. Authorities are assigned directly to your verified wallet - make sure you&apos;ve linked and
        verified one in Settings first.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Token image</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || submitting}
            className="flex items-center gap-3 rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 hover:border-zrp-red transition disabled:opacity-50"
          >
            {imagePreview ? (
              <Image src={imagePreview} alt="Token preview" width={48} height={48} className="w-12 h-12 rounded-full object-cover" unoptimized />
            ) : (
              <Upload className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isUploading ? "Uploading..." : imageUrl ? "Change image" : "Upload image (PNG, JPG, GIF, WebP - max 4MB)"}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Symbol</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Total supply</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Decimals</label>
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
            placeholder="Website (optional)"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder="Twitter/X (optional)"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder="Telegram (optional)"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder="Discord (optional)"
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Authorities</p>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeMint} onChange={(e) => setRevokeMint(e.target.checked)} disabled={submitting} />
            Revoke mint authority (fixes the supply forever)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeFreeze} onChange={(e) => setRevokeFreeze(e.target.checked)} disabled={submitting} />
            Revoke freeze authority
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeUpdate} onChange={(e) => setRevokeUpdate(e.target.checked)} disabled={submitting} />
            Revoke update (metadata) authority - makes name/image permanent
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Any authority not revoked is assigned to your verified wallet - never kept by ZRP.
          </p>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Creation fee: {CREATION_FEE_USDC} USDC</p>
          {platformWallet ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                  1. Send {CREATION_FEE_USDC} USDC to
                </label>
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                  <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
                  <button type="button" onClick={handleCopyAddress} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">2. Paste the transaction ID</label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  disabled={submitting}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Payments are temporarily unavailable.</p>
          )}
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={submitting || isUploading || !platformWallet}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Minting on-chain...
            </>
          ) : (
            "Create token"
          )}
        </button>
      </form>
    </div>
  );
}
