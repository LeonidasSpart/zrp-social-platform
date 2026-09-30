"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { safeExternalHref } from "@/lib/profile-website";

interface LaunchedTokenDetail {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  supply: string;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

function formatSupply(rawSupply: string, decimals: number): string {
  try {
    const raw = BigInt(rawSupply);
    if (decimals === 0) return raw.toLocaleString();
    let divisor = BigInt(1);
    for (let i = 0; i < decimals; i += 1) divisor *= BigInt(10);
    const whole = raw / divisor;
    return whole.toLocaleString();
  } catch {
    return rawSupply;
  }
}

export default function TokenDetailPage() {
  const params = useParams<{ mint: string }>();
  const [token, setToken] = useState<LaunchedTokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!params.mint) return;
    setLoading(true);
    fetch(`/api/launchpad/tokens/${params.mint}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Token not found.");
        return res.json();
      })
      .then((data) => setToken(data.token))
      .catch(() => setError("Token not found."))
      .finally(() => setLoading(false));
  }, [params.mint]);

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.mintAddress);
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

  if (error || !token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{error || "Token not found."}</p>
      </div>
    );
  }

  const socialLinks = [
    { label: "Website", href: safeExternalHref(token.website) },
    { label: "Twitter", href: safeExternalHref(token.twitter) },
    { label: "Telegram", href: safeExternalHref(token.telegram) },
    { label: "Discord", href: safeExternalHref(token.discord) },
  ].filter((l) => l.href);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-4">
        <Image src={token.imageUrl} alt={token.name} width={64} height={64} className="w-16 h-16 rounded-full object-cover" unoptimized />
        <div>
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{token.name}</h1>
          <p className="text-gray-500 dark:text-gray-400">${token.symbol}</p>
        </div>
      </div>

      {token.description && <p className="text-gray-700 dark:text-gray-300 mb-4">{token.description}</p>}

      <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-4">
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Mint address</label>
        <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
          <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{token.mintAddress}</span>
          <button type="button" onClick={handleCopy} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total supply</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatSupply(token.supply, token.decimals)}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Decimals</p>
          <p className="font-semibold text-gray-900 dark:text-white">{token.decimals}</p>
        </div>
      </div>

      <div className="space-y-1 mb-4">
        {[
          { label: "Mint authority", revoked: token.revokeMint },
          { label: "Freeze authority", revoked: token.revokeFreeze },
          { label: "Update authority", revoked: token.revokeUpdate },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            {row.revoked ? <ShieldCheck className="w-4 h-4 text-green-500" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
            {row.label}: {row.revoked ? "Revoked" : "Held by creator's wallet"}
          </div>
        ))}
      </div>

      {socialLinks.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {socialLinks.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-zrp-red hover:underline">
              {l.label}
            </a>
          ))}
        </div>
      )}

      {token.creator && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Created by{" "}
          <Link href={`/profile/${token.creator.username}`} className="text-zrp-red hover:underline">
            @{token.creator.username}
          </Link>
        </p>
      )}
    </div>
  );
}
