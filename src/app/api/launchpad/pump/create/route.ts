export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { normalizeProfileWebsite } from "@/lib/profile-website";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { verifyCreateTransaction, CurveVerificationError } from "@/lib/launchpad/pump-curve-service";
import { scanTokenOnChain } from "@/lib/launchpad/mint-verification";
import { getConnection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/*
 * POST: verify + record an already-created pump bonding-curve token.
 * The mint itself happens entirely in the browser
 * (src/lib/launchpad/client-pump-create.ts), against pump.fun's own
 * mainnet program - ZRP never signs or custodies anything here, and
 * charges no separate creation fee for this path (pump.fun's own protocol
 * fees apply on curve trades instead). This route independently
 * re-derives the token's real on-chain name/symbol/creator from the
 * transaction's own decoded CreateEvent (never trusting the client's
 * submitted name/symbol beyond initial cosmetic validation) and re-scans
 * the resulting mint account for its real decimals/supply, before
 * recording anything - "never record a token as created before chain
 * verification."
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 5, window: 300, type: "launchpad-pump-create" });
    if (!limit.success) return limit.response;

    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const body = await req.json();
    const { name, symbol, description, imageUrl, website, twitter, telegram, discord, mintAddress, walletAddress, transactionId } = body;

    // ─── Off-chain display field validation (cosmetic only for
    // description/image/socials - name/symbol are re-derived from the
    // real on-chain CreateEvent below and never trusted from the client
    // for the stored record) ──────────────────────────────────────────
    if (!isNonEmptyString(name) || name.trim().length > 32) {
      return NextResponse.json({ error: "Name is required (max 32 characters)." }, { status: 400 });
    }
    if (!isNonEmptyString(symbol) || !/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      return NextResponse.json({ error: "Symbol is required (max 10 letters/numbers, no spaces)." }, { status: 400 });
    }

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > 1000) {
        return NextResponse.json({ error: "Description is too long (max 1000 characters)." }, { status: 400 });
      }
      cleanDescription = description.trim() || null;
    }

    if (!isNonEmptyString(imageUrl)) {
      return NextResponse.json({ error: "A token image is required." }, { status: 400 });
    }
    const imageCheck = validateTrustedUploadUrls([imageUrl]);
    if (!imageCheck.ok) {
      return NextResponse.json({ error: imageCheck.error }, { status: 400 });
    }

    const socialLinks: { website: string | null; twitter: string | null; telegram: string | null; discord: string | null } = {
      website: null,
      twitter: null,
      telegram: null,
      discord: null,
    };
    for (const [key, value, label] of [
      ["website", website, "Website"],
      ["twitter", twitter, "Twitter"],
      ["telegram", telegram, "Telegram"],
      ["discord", discord, "Discord"],
    ] as const) {
      const result = normalizeProfileWebsite(value, label);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      socialLinks[key] = result.value;
    }

    if (!isNonEmptyString(mintAddress) || !isValidPublicKey(mintAddress.trim())) {
      return NextResponse.json({ error: "A valid mint address is required." }, { status: 400 });
    }
    const cleanMintAddress = mintAddress.trim();

    if (!isNonEmptyString(walletAddress) || !isValidPublicKey(walletAddress.trim())) {
      return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
    }
    const cleanWalletAddress = walletAddress.trim();

    if (!isNonEmptyString(transactionId)) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    // ─── Fast-path duplicate checks (the real race-proof guards are the
    // unique constraints hit inside the create below) ─────────────────
    const existingToken = await prisma.launchedToken.findUnique({ where: { mintAddress: cleanMintAddress } });
    if (existingToken) {
      return NextResponse.json({ error: "This mint has already been recorded." }, { status: 409 });
    }
    const existingTx = await prisma.launchedToken.findUnique({ where: { mintTransactionId: transactionId } });
    if (existingTx) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    // ─── Independently verify the real on-chain creation - never trust
    // the client's claimed name/symbol/creator ────────────────────────
    let verifiedCreate;
    try {
      verifiedCreate = await verifyCreateTransaction(getConnection(), transactionId, {
        mintAddress: cleanMintAddress,
        walletAddress: cleanWalletAddress,
      });
    } catch (err: unknown) {
      if (err instanceof CurveVerificationError) {
        const status = err.status === "NOT_FOUND_YET" ? 202 : 400;
        return NextResponse.json({ error: err.message, status: err.status }, { status });
      }
      console.error("Pump create verification error:", err);
      return NextResponse.json({ error: "Could not verify the creation transaction. Try again in a moment." }, { status: 502 });
    }

    // ─── Re-scan the real mint account for decimals/supply - pump sets
    // these on-chain (Token-2022, fixed total supply); never guessed or
    // taken from the client ────────────────────────────────────────────
    let onChain;
    try {
      onChain = await scanTokenOnChain(cleanMintAddress);
    } catch (err: unknown) {
      console.error("Pump create mint scan error:", err);
      return NextResponse.json({ error: "Could not read the mint from the chain. Try again in a moment." }, { status: 502 });
    }

    let launchedToken;
    try {
      launchedToken = await prisma.launchedToken.create({
        data: {
          venue: "PUMP_CURVE",
          mintAddress: cleanMintAddress,
          name: verifiedCreate.name || name.trim(),
          symbol: (verifiedCreate.symbol || symbol.trim()).toUpperCase(),
          description: cleanDescription,
          imageUrl,
          website: socialLinks.website,
          twitter: socialLinks.twitter,
          telegram: socialLinks.telegram,
          discord: socialLinks.discord,
          supply: onChain.supplyRaw,
          decimals: onChain.decimals,
          // Mint/freeze authority on a pump-created token are the
          // program's own PDAs, never the creator's wallet, and there is
          // no separate update-authority concept (pump stores name/
          // symbol/uri directly in its own on-chain state, not via a
          // Metaplex metadata account) - functionally equivalent to
          // "revoked" from the connecting user's own authority.
          revokeMint: true,
          revokeFreeze: true,
          revokeUpdate: true,
          feeAmount: null,
          feeTransactionId: null,
          mintTransactionId: transactionId,
          status: "COMPLETED",
          creatorId: userId,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction or mint already processed." }, { status: 409 });
      }
      throw err;
    }

    return jsonWithDecimals({ success: true, token: launchedToken }, { status: 201 });
  } catch (error) {
    console.error("Pump token creation error:", error);
    return NextResponse.json({ error: "Failed to record the created token. Please try again." }, { status: 500 });
  }
}
