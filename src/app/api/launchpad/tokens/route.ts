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
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { normalizeProfileWebsite } from "@/lib/profile-website";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { checkPaymentSender } from "@/lib/payment-sender";
import { scanTokenOnChain, verifyTransactionCreatedMint } from "@/lib/launchpad/mint-verification";
import { creditReferralCommission } from "@/lib/referral";
import { PublicKey } from "@solana/web3.js";

// Flat USDC fee, matching the tip/premium-purchase pattern of a fixed,
// on-chain-verified amount rather than a plan-tier price.
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

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: public browse - only CONFIRMED mints, newest first ────────
//
// `hasPool=1` filters to tokens with at least one real, independently-
// verified ACTIVE Raydium pool (src/app/api/launchpad/pools/create) -
// a genuine "is this actually tradeable yet" signal, not a fabricated
// one. Sorting by volume/liquidity/holder-count is deliberately NOT
// offered here: doing it honestly needs either a live cross-pool RPC
// aggregation per request (too expensive/rate-limit-risky at list scale)
// or the AnalyticsSnapshot-style cache table described in
// docs/launchpad-bonding-curve-research.md's sibling indexing work,
// neither of which exists yet - this never silently approximates that
// with a fabricated ordering.
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const hasPool = req.nextUrl.searchParams.get("hasPool") === "1";

    const tokens = await prisma.launchedToken.findMany({
      where: {
        status: "COMPLETED",
        mintAddress: { not: null },
        ...(hasPool ? { pools: { some: { status: "ACTIVE" } } } : {}),
      },
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
        _count: { select: { pools: { where: { status: "ACTIVE" } } } },
      },
    });

    const { items, nextCursor } = buildPage(tokens, limit);
    const tokensWithPoolCount = items.map(({ _count, ...rest }) => ({ ...rest, activePoolCount: _count.pools }));
    return jsonWithDecimals({ tokens: tokensWithPoolCount, nextCursor });
  } catch (error) {
    console.error("Error fetching launched tokens:", error);
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 });
  }
}

// ─── POST: verify + record an already-minted SPL token ───────────────
// The mint itself happens entirely in the browser now
// (src/lib/launchpad/client-token-mint.ts), atomically with the USDC fee
// payment, signed once by the user's own connected wallet - the same
// one-click UX zrppad always had. This route never signs or broadcasts
// anything; it independently re-derives every verifiable fact about the
// resulting mint from the chain itself (never trusting the client's
// claimed decimals/supply/authorities/name/symbol) and records it.
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = token.id as string;

    // Verification does real RPC work - cap abuse the same as the old
    // (more expensive) server-signed path did.
    const limit = await rateLimitByIpAndUser(req, userId, { limit: 5, window: 300, type: "launchpad-token-create" });
    if (!limit.success) return limit.response;

    // Same store-sensitive payment surface as tips/premium purchases.
    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const body = await req.json();
    const { name, symbol, description, imageUrl, website, twitter, telegram, discord, mintAddress, transactionId } = body;

    // ─── Off-chain display field validation (cosmetic only - every
    // verifiable fact is re-derived from the chain below) ────────────
    if (!isNonEmptyString(name) || name.trim().length > 32) {
      return NextResponse.json({ error: "Name is required (max 32 characters)." }, { status: 400 });
    }
    if (!isNonEmptyString(symbol) || !/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      return NextResponse.json(
        { error: "Symbol is required (max 10 letters/numbers, no spaces)." },
        { status: 400 }
      );
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

    if (!isNonEmptyString(transactionId)) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    // ─── Fast-path duplicate checks (the real race-proof guards are the
    // unique constraints hit inside the $transaction below) ──────────
    const [existingClaim, existingToken] = await Promise.all([
      prisma.consumedPaymentTransaction.findUnique({ where: { transactionId } }),
      prisma.launchedToken.findUnique({ where: { mintAddress: cleanMintAddress } }),
    ]);
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }
    if (existingToken) {
      return NextResponse.json({ error: "This mint has already been recorded." }, { status: 409 });
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

    // ⚠️ SECURITY: prove the SAME transaction that paid the fee is the
    // one that created this exact mint - otherwise a real fee payment
    // from an unrelated transfer could be replayed to falsely claim
    // authorship of an arbitrary pre-existing mint address. See
    // mint-verification.ts's own comment for the full rationale.
    const createdThisMint = await verifyTransactionCreatedMint(transactionId, cleanMintAddress);
    if (!createdThisMint) {
      return NextResponse.json(
        { error: "The fee transaction did not create this mint. Make sure both happened in the same signed transaction." },
        { status: 400 }
      );
    }

    // ─── Re-derive every verifiable fact from the chain itself - never
    // trust client-submitted decimals/supply/authorities/name/symbol. ──
    let onChain;
    try {
      onChain = await scanTokenOnChain(cleanMintAddress);
    } catch (err: unknown) {
      console.error("Launchpad mint verification error:", err);
      return NextResponse.json({ error: "Could not read the mint from the chain. Try again in a moment." }, { status: 502 });
    }
    if (!onChain.metadata) {
      return NextResponse.json({ error: "No metadata account found for this mint." }, { status: 400 });
    }

    const finalName = onChain.metadata.name || name.trim();
    const finalSymbol = (onChain.metadata.symbol || symbol.trim()).toUpperCase();
    const finalDecimals = onChain.decimals;
    const finalSupply = onChain.supplyRaw;
    const finalRevokeMint = onChain.mintAuthority === null;
    const finalRevokeFreeze = onChain.freezeAuthority === null;
    const finalRevokeUpdate = !onChain.metadata.isMutable;

    // ─── Claim the fee + create the COMPLETED row atomically - by
    // construction this route is only ever called after the mint has
    // already succeeded on-chain, so there is no PENDING/FAILED
    // transition to manage the way the old server-signed path needed. ──
    let launchedToken;
    try {
      const created = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "token_creation_fee", paymentId: cleanMintAddress },
        }),
        prisma.launchedToken.create({
          data: {
            mintAddress: cleanMintAddress,
            name: finalName,
            symbol: finalSymbol,
            description: cleanDescription,
            imageUrl,
            website: socialLinks.website,
            twitter: socialLinks.twitter,
            telegram: socialLinks.telegram,
            discord: socialLinks.discord,
            supply: finalSupply,
            decimals: finalDecimals,
            revokeMint: finalRevokeMint,
            revokeFreeze: finalRevokeFreeze,
            revokeUpdate: finalRevokeUpdate,
            feeAmount: verifiedAmount,
            feeTransactionId: transactionId,
            mintTransactionId: transactionId,
            status: "COMPLETED",
            creatorId: userId,
          },
        }),
      ]);
      launchedToken = created[1];
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction or mint already processed." }, { status: 409 });
      }
      throw err;
    }

    // Referral commission is only ever earned on a fee ZRP actually
    // kept, for a mint that actually succeeded - by construction always
    // true here, but this call never throws regardless (see its own
    // comment) so it never risks this response either way.
    await creditReferralCommission("LAUNCHPAD_TOKEN_CREATION", launchedToken.id, userId, verifiedAmount);

    return jsonWithDecimals({ success: true, token: launchedToken }, { status: 201 });
  } catch (error) {
    console.error("Launchpad token creation error:", error);
    return NextResponse.json({ error: "Failed to record the created token. Please try again." }, { status: 500 });
  }
}
