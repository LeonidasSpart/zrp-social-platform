export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { normalizeProfileWebsite } from "@/lib/profile-website";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { checkPaymentSender } from "@/lib/payment-sender";
import { getVerifiedWallet } from "@/lib/launchpad/entitlement";
import { mintLaunchedToken } from "@/lib/launchpad/mint-service";
import { creditReferralCommission } from "@/lib/referral";

// Flat USDC fee, matching the tip/premium-purchase pattern of a fixed,
// on-chain-verified amount rather than a plan-tier price. zrppad charges
// a flat fee (0.05 SOL, mainnet only) for the same action; this is the
// USDC-denominated equivalent for ZRP's own payment rail.
const TOKEN_CREATION_FEE_USDC = 15;
const FEE_TOLERANCE = 0.000001; // USDC has 6 decimals

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ─── GET: public browse - only CONFIRMED mints, newest first ────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);

    const tokens = await prisma.launchedToken.findMany({
      where: { status: "COMPLETED", mintAddress: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        mintAddress: true,
        name: true,
        symbol: true,
        description: true,
        imageUrl: true,
        supply: true,
        decimals: true,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
      },
    });

    const { items, nextCursor } = buildPage(tokens, limit);
    return jsonWithDecimals({ tokens: items, nextCursor });
  } catch (error) {
    console.error("Error fetching launched tokens:", error);
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 });
  }
}

// ─── POST: create (mint) a new SPL token ─────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = token.id as string;

    // Minting does real RPC work and moves real money - cap abuse.
    // ⚠️ SECURITY: also keyed on the token id, not just IP.
    const limit = await rateLimitByIpAndUser(req, userId, { limit: 5, window: 300, type: "launchpad-token-create" });
    if (!limit.success) return limit.response;

    // Same store-sensitive payment surface as tips/premium purchases.
    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const body = await req.json();
    const {
      name,
      symbol,
      description,
      imageUrl,
      website,
      twitter,
      telegram,
      discord,
      supply,
      decimals,
      revokeMint,
      revokeFreeze,
      revokeUpdate,
      transactionId,
    } = body;

    // ─── Field validation ───────────────────────────────────────
    if (!isNonEmptyString(name) || name.trim().length > 32) {
      return NextResponse.json({ error: "Name is required (max 32 characters)." }, { status: 400 });
    }
    if (!isNonEmptyString(symbol) || !/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      return NextResponse.json(
        { error: "Symbol is required (max 10 letters/numbers, no spaces)." },
        { status: 400 }
      );
    }
    const cleanSymbol = symbol.trim().toUpperCase();

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

    const numericDecimals = Number(decimals);
    if (!Number.isInteger(numericDecimals) || numericDecimals < 0 || numericDecimals > 9) {
      return NextResponse.json({ error: "Decimals must be an integer between 0 and 9." }, { status: 400 });
    }

    // Whole-token supply, digits only - kept as a string and combined
    // with decimals via BigInt arithmetic (never floating point) so
    // large supplies can't lose precision before they're minted.
    const supplyStr = typeof supply === "string" ? supply.trim() : typeof supply === "number" ? String(Math.trunc(supply)) : "";
    if (!/^[1-9]\d*$/.test(supplyStr) || supplyStr.length > 20) {
      return NextResponse.json({ error: "Supply must be a positive whole number." }, { status: 400 });
    }
    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < numericDecimals; i += 1) decimalMultiplier *= BigInt(10);
    const rawSupply = BigInt(supplyStr) * decimalMultiplier;

    if (!isNonEmptyString(transactionId)) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const cleanRevokeMint = revokeMint === true;
    const cleanRevokeFreeze = revokeFreeze === true;
    const cleanRevokeUpdate = revokeUpdate === true;

    // ─── Verified wallet required - authorities are assigned to it ──
    const walletAddress = await getVerifiedWallet(userId);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Link and verify a Solana wallet in Settings before creating a token." },
        { status: 403 }
      );
    }

    // ─── Duplicate transaction fast path (see creator/tip for the
    // race-proof guard, which is the ConsumedPaymentTransaction claim
    // inside the $transaction below - this is only the fast path) ────
    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    // ─── Verify the creation fee on-chain ────────────────────────
    let verifiedAmount: number;
    try {
      const { verifyUsdcTransaction } = await import("@/lib/solana");
      const result = await verifyUsdcTransaction(transactionId);
      if (!result || !result.valid) {
        return NextResponse.json({ error: "Invalid or pending transaction." }, { status: 400 });
      }
      verifiedAmount = Number(result.amount);
      if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        return NextResponse.json({ error: "Could not determine the verified transaction amount." }, { status: 400 });
      }
      if (Math.abs(verifiedAmount - TOKEN_CREATION_FEE_USDC) > FEE_TOLERANCE) {
        return NextResponse.json(
          {
            error: `The creation fee is ${TOKEN_CREATION_FEE_USDC} USDC.`,
            verifiedAmount,
            requiredAmount: TOKEN_CREATION_FEE_USDC,
          },
          { status: 400 }
        );
      }

      // ⚠️ SECURITY: bind the on-chain sender to the authenticated ZRP
      // account - see creator/tip/route.ts for the full rationale.
      const senderError = await checkPaymentSender(userId, result.from);
      if (senderError) {
        return NextResponse.json({ error: senderError }, { status: 400 });
      }
    } catch (err: unknown) {
      console.error("Launchpad fee verification error:", err);
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: `Failed to verify transaction: ${message}` }, { status: 400 });
    }

    // ─── Claim the fee + create the PENDING row atomically ───────
    // Same pattern as creator/tip: claiming ConsumedPaymentTransaction is
    // the first statement in the transaction - its unique constraint on
    // transactionId is the actual race-proof guard. The id is generated
    // here (not left to @default(cuid())) so both rows can reference it
    // without a second round trip, same as tip's own tipId.
    const launchedTokenId = randomUUID();
    let launchedToken;
    try {
      const created = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "token_creation_fee", paymentId: launchedTokenId },
        }),
        prisma.launchedToken.create({
          data: {
            id: launchedTokenId,
            name: name.trim(),
            symbol: cleanSymbol,
            description: cleanDescription,
            imageUrl,
            website: socialLinks.website,
            twitter: socialLinks.twitter,
            telegram: socialLinks.telegram,
            discord: socialLinks.discord,
            supply: rawSupply.toString(),
            decimals: numericDecimals,
            revokeMint: cleanRevokeMint,
            revokeFreeze: cleanRevokeFreeze,
            revokeUpdate: cleanRevokeUpdate,
            feeAmount: verifiedAmount,
            feeTransactionId: transactionId,
            status: "PENDING",
            creatorId: userId,
          },
        }),
      ]);
      launchedToken = created[1];
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    // ─── Mint synchronously (no queue for v1 - matches every other
    // Solana write path in this codebase) ────────────────────────
    // The mint keypair is generated HERE (not inside mint-service) so its
    // public key - the mint address - is already known when building the
    // metadata URI below, letting that URI be keyed by mint address
    // (GET /api/launchpad/tokens/[mint]/metadata.json) rather than by an
    // internal id that would leak before the mint exists on-chain.
    const mintKeypair = Keypair.generate();
    const metadataUri = new URL(
      `/api/launchpad/tokens/${mintKeypair.publicKey.toBase58()}/metadata.json`,
      process.env.NEXTAUTH_URL || req.nextUrl.origin
    ).toString();

    await mintLaunchedToken({
      launchedTokenId: launchedToken.id,
      ownerWalletAddress: walletAddress,
      mintKeypair,
      name: launchedToken.name,
      symbol: launchedToken.symbol,
      metadataUri,
      decimals: numericDecimals,
      supply: rawSupply,
      revokeMint: cleanRevokeMint,
      revokeFreeze: cleanRevokeFreeze,
      revokeUpdate: cleanRevokeUpdate,
    });

    const finalRow = await prisma.launchedToken.findUnique({ where: { id: launchedToken.id } });

    // Referral commission is only ever earned on a fee ZRP actually kept,
    // for a mint that actually succeeded - never on a fee attached to a
    // failed mint (see creditReferralCommission's own comment for why
    // this never throws and so never risks this response).
    if (finalRow?.status === "COMPLETED") {
      await creditReferralCommission("LAUNCHPAD_TOKEN_CREATION", launchedToken.id, userId, verifiedAmount);
    }

    return jsonWithDecimals({ success: finalRow?.status === "COMPLETED", token: finalRow }, { status: 201 });
  } catch (error) {
    console.error("Launchpad token creation error:", error);
    return NextResponse.json({ error: "Failed to create token. Please try again." }, { status: 500 });
  }
}
