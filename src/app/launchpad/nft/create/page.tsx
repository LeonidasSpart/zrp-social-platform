"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Loader2, Copy, Check, Upload, Plus, X } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";
import { useLanguage } from "@/contexts/LanguageContext";

// Kept in sync with the fee charged in src/app/api/launchpad/nfts/route.ts
// (NFT_CREATION_FEE_USDC). The server independently verifies the exact
// amount on-chain - this constant is only what the form displays.
const CREATION_FEE_USDC = 5;

interface AttributeRow {
  trait_type: string;
  value: string;
}

export default function CreateNftPage() {
  const { t } = useLanguage();
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
  const [collectionName, setCollectionName] = useState("");
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [royaltyPercent, setRoyaltyPercent] = useState("5");
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
        setError(t("launchpad.nftCreate.imageUploadError"));
        return;
      }
      setImageUrl(uploaded.ufsUrl);
    } catch {
      setError(t("launchpad.nftCreate.imageUploadError"));
    }
  };

  const addAttribute = () => setAttributes((prev) => [...prev, { trait_type: "", value: "" }]);
  const updateAttribute = (index: number, field: keyof AttributeRow, value: string) =>
    setAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  const removeAttribute = (index: number) => setAttributes((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length > 32) {
      setError(t("launchpad.nftCreate.nameRequired"));
      return;
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      setError(t("launchpad.nftCreate.symbolRequired"));
      return;
    }
    if (!imageUrl) {
      setError(t("launchpad.nftCreate.imageRequired"));
      return;
    }
    const royaltyBasisPoints = Math.round(Number(royaltyPercent) * 100);
    if (!Number.isInteger(royaltyBasisPoints) || royaltyBasisPoints < 0 || royaltyBasisPoints > 10000) {
      setError(t("launchpad.nftCreate.royaltyInvalid"));
      return;
    }
    if (!transactionId.trim()) {
      setError(t("launchpad.nftCreate.transactionIdRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/nfts", {
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
          collectionName: collectionName.trim() || undefined,
          attributes: attributes.filter((a) => a.trait_type.trim() && a.value.trim()),
          sellerFeeBasisPoints: royaltyBasisPoints,
          revokeUpdate,
          transactionId: transactionId.trim(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || t("launchpad.nftCreate.createError"));
      }
      if (!data?.success || !data?.nft?.mintAddress) {
        throw new Error(data?.nft?.failureReason || t("launchpad.nftCreate.mintIncomplete"));
      }

      router.push(`/launchpad/nft/${data.nft.mintAddress}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.nftCreate.createError"));
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
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.nftCreate.signInRequired")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.nftCreate.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("launchpad.nftCreate.description")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.imageLabel")}</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || submitting}
            className="flex items-center gap-3 rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 hover:border-zrp-red transition disabled:opacity-50"
          >
            {imagePreview ? (
              <Image src={imagePreview} alt={t("launchpad.nftCreate.imagePreviewAlt")} width={48} height={48} className="w-12 h-12 rounded-md object-cover" unoptimized />
            ) : (
              <Upload className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isUploading
                ? t("launchpad.nftCreate.uploading")
                : imageUrl
                  ? t("launchpad.nftCreate.changeImage")
                  : t("launchpad.nftCreate.uploadImageHint")}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.nameLabel")}</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.symbolLabel")}</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.descriptionLabel")}</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.collectionLabel")}</label>
            <input
              type="text"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              maxLength={64}
              placeholder={t("launchpad.nftCreate.collectionPlaceholder")}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.royaltyLabel")}</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={royaltyPercent}
              onChange={(e) => setRoyaltyPercent(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.nftCreate.attributesLabel")}</label>
            <button
              type="button"
              onClick={addAttribute}
              disabled={submitting || attributes.length >= 20}
              className="inline-flex items-center gap-1 text-xs text-zrp-red hover:underline disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> {t("launchpad.nftCreate.addAttribute")}
            </button>
          </div>
          {attributes.map((attr, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder={t("launchpad.nftCreate.traitPlaceholder")}
                value={attr.trait_type}
                onChange={(e) => updateAttribute(i, "trait_type", e.target.value)}
                maxLength={64}
                disabled={submitting}
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                type="text"
                placeholder={t("launchpad.nftCreate.valuePlaceholder")}
                value={attr.value}
                onChange={(e) => updateAttribute(i, "value", e.target.value)}
                maxLength={256}
                disabled={submitting}
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <button
                type="button"
                onClick={() => removeAttribute(i)}
                disabled={submitting}
                className="flex-shrink-0 text-gray-400 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={revokeUpdate} onChange={(e) => setRevokeUpdate(e.target.checked)} disabled={submitting} />
            {t("launchpad.nftCreate.freezeMetadataLabel")}
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t("launchpad.nftCreate.freezeMetadataHint")}
          </p>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("launchpad.nftCreate.creationFee", { fee: CREATION_FEE_USDC })}
          </p>
          {platformWallet ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                  {t("launchpad.nftCreate.sendFeeStep", { fee: CREATION_FEE_USDC })}
                </label>
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                  <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
                  <button type="button" onClick={handleCopyAddress} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{t("launchpad.nftCreate.pasteTxStep")}</label>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("launchpad.nftCreate.paymentsUnavailable")}</p>
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
              {t("launchpad.nftCreate.minting")}
            </>
          ) : (
            t("launchpad.nftCreate.submitButton")
          )}
        </button>
      </form>
    </div>
  );
}
