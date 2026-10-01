"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

interface LaunchedNftDetail {
  id: string;
  mintAddress: string;
  name: string;
  description: string | null;
  imageUrl: string;
  collectionName: string | null;
  attributes: { trait_type: string; value: string }[] | null;
  sellerFeeBasisPoints: number;
  revokeUpdate: boolean;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

export default function NftDetailPage() {
  const params = useParams<{ mint: string }>();
  const [nft, setNft] = useState<LaunchedNftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!params.mint) return;
    setLoading(true);
    fetch(`/api/launchpad/nfts/${params.mint}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("NFT not found.");
        return res.json();
      })
      .then((data) => setNft(data.nft))
      .catch(() => setError("NFT not found."))
      .finally(() => setLoading(false));
  }, [params.mint]);

  const handleCopy = async () => {
    if (!nft) return;
    try {
      await navigator.clipboard.writeText(nft.mintAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the address is still visible.
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error || !nft) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{error || "NFT not found."}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Image src={nft.imageUrl} alt={nft.name} width={600} height={600} className="w-full aspect-square rounded-xl object-cover mb-4" unoptimized />

      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{nft.name}</h1>
      {nft.collectionName && <p className="text-gray-500 dark:text-gray-400 mb-2">{nft.collectionName}</p>}

      {nft.description && <p className="text-gray-700 dark:text-gray-300 my-4">{nft.description}</p>}

      <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-4">
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Mint address</label>
        <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
          <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{nft.mintAddress}</span>
          <button type="button" onClick={handleCopy} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {nft.attributes && nft.attributes.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Attributes</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {nft.attributes.map((attr, i) => (
              <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 p-2 text-center">
                <p className="text-xs uppercase text-gray-400 dark:text-gray-500">{attr.trait_type}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{attr.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          {nft.revokeUpdate ? <ShieldCheck className="w-4 h-4 text-green-500" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
          Metadata: {nft.revokeUpdate ? "Frozen (immutable)" : "Mutable (held by creator's wallet)"}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Royalty: {(nft.sellerFeeBasisPoints / 100).toFixed(2)}%</p>
      </div>

      {nft.creator && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Created by{" "}
          <Link href={`/profile/${nft.creator.username}`} className="text-zrp-red hover:underline">
            @{nft.creator.username}
          </Link>
        </p>
      )}
    </div>
  );
}
