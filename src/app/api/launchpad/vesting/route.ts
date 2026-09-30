export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { checkPaymentSender } from "@/lib/payment-sender";
import { computeClaimableRaw } from "@/lib/launchpad/vesting-service";

const MAX_DURATION_SECONDS = 20 * 365 * 24 * 3600; // 20 years - a sane upper bound, not a real constraint

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: list vesting contracts, by beneficiary wallet (public - the
// claim page's own lookup) or the caller's own created contracts ──────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const beneficiaryWalletAddress = req.nextUrl.searchParams.get("beneficiaryWalletAddress");
    const mine = req.nextUrl.searchParams.get("mine") === "1";
    const launchedTokenId = req.nextUrl.searchParams.get("launchedTokenId");

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "vesting-list" });
    if (!limitCheck.success) return limitCheck.response;

    const where: { creatorId?: string; beneficiaryWalletAddress?: string; launchedTokenId?: string } = {};

    if (mine) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      where.creatorId = token.id as string;
    } else if (beneficiaryWalletAddress) {
      if (!isValidPublicKey(beneficiaryWalletAddress)) {
        return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
      }
      where.beneficiaryWalletAddress = beneficiaryWalletAddress;
    } else {
      return NextResponse.json({ error: "Provide beneficiaryWalletAddress or mine=1." }, { status: 400 });
    }
    if (launchedTokenId) where.launchedTokenId = launchedTokenId;

    const contracts = await prisma.vestingContract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
      },
    });

    const { items, nextCursor } = buildPage(contracts, limit);
    const withClaimable = items.map((c) => ({ ...c, claimableRaw: computeClaimableRaw(c).toString() }));

    return jsonWithDecimals({ contracts: withClaimable, nextCursor });
  } catch (error) {
    console.error("Error fetching vesting contracts:", error);
    return NextResponse.json({ error: "Failed to fetch vesting contracts" }, { status: 500 });
  }
}

// ─── POST: create a vesting contract - deposit already paid externally,
// verified on-chain here (same "pay externally, paste the tx signature"
// pattern as every other payment-in flow in this codebase) ───────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "vesting-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { launchedTokenId, beneficiaryWalletAddress, amount, cliffSeconds, vestingSeconds, startAt, depositTransactionId } = body;

    if (typeof launchedTokenId !== "string" || !launchedTokenId) {
      return NextResponse.json({ error: "launchedTokenId is required." }, { status: 400 });
    }
    if (!isValidPublicKey(beneficiaryWalletAddress)) {
      return NextResponse.json({ error: "A valid beneficiary wallet address is required." }, { status: 400 });
    }
    const amountStr = typeof amount === "string" ? amount.trim() : typeof amount === "number" ? String(Math.trunc(amount)) : "";
    if (!/^[1-9]\d*$/.test(amountStr) || amountStr.length > 20) {
      return NextResponse.json({ error: "Amount must be a positive whole number of tokens." }, { status: 400 });
    }
    const numericCliff = Number(cliffSeconds);
    if (!Number.isInteger(numericCliff) || numericCliff < 0 || numericCliff > MAX_DURATION_SECONDS) {
      return NextResponse.json({ error: "Invalid cliff duration." }, { status: 400 });
    }
    const numericVesting = Number(vestingSeconds);
    if (!Number.isInteger(numericVesting) || numericVesting < 0 || numericVesting > MAX_DURATION_SECONDS) {
      return NextResponse.json({ error: "Invalid vesting duration." }, { status: 400 });
    }
    const startDate = startAt ? new Date(startAt) : new Date();
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
    if (typeof depositTransactionId !== "string" || !depositTransactionId) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const launchedToken = await prisma.launchedToken.findUnique({ where: { id: launchedTokenId } });
    if (!launchedToken || launchedToken.status !== "COMPLETED" || !launchedToken.mintAddress) {
      return NextResponse.json({ error: "Token not found or not yet minted." }, { status: 404 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < launchedToken.decimals; i += 1) decimalMultiplier *= BigInt(10);
    const rawAmount = BigInt(amountStr) * decimalMultiplier;

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId: depositTransactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    try {
      const { verifySplTransferToPlatform } = await import("@/lib/launchpad/spl-transfer-verify");
      const result = await verifySplTransferToPlatform(depositTransactionId, launchedToken.mintAddress);

      if (result.rawAmount !== rawAmount) {
        return NextResponse.json(
          {
            error: "The deposited amount does not match the vesting amount.",
            depositedRaw: result.rawAmount.toString(),
            requiredRaw: rawAmount.toString(),
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
      console.error("Vesting deposit verification error:", err);
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: `Failed to verify deposit: ${message}` }, { status: 400 });
    }

    // id generated up front (not left to @default(cuid())) so both rows
    // can reference it in the same $transaction without a second round
    // trip - same pattern as launchpad/tokens' own launchedTokenId.
    const contractId = randomUUID();
    let contract;
    try {
      const created = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId: depositTransactionId, paymentType: "vesting_deposit", paymentId: contractId },
        }),
        prisma.vestingContract.create({
          data: {
            id: contractId,
            launchedTokenId,
            creatorId: userId,
            beneficiaryWalletAddress,
            totalAmount: rawAmount.toString(),
            cliffSeconds: numericCliff,
            vestingSeconds: numericVesting,
            startAt: startDate,
            depositTransactionId,
            status: "ACTIVE",
          },
        }),
      ]);
      contract = created[1];
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    return jsonWithDecimals({ contract }, { status: 201 });
  } catch (error) {
    console.error("Vesting contract creation error:", error);
    return NextResponse.json({ error: "Failed to create vesting contract. Please try again." }, { status: 500 });
  }
}
