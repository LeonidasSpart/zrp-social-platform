export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { verifyAirdropBatchTransaction } from "@/lib/launchpad/airdrop-service";

// Server-enforced upper bound on recipients per airdrop run - zrppad only
// ever enforced this client-side (NEXT_PUBLIC_MAX_AIRDROP_RECIPIENTS),
// which bounds nothing since a client can always call the API directly.
// Keep this in sync with MAX_RECIPIENTS in the airdrop page.
const MAX_AIRDROP_RECIPIENTS = 100;
// A batch never has more recipients than the total cap, so this is a
// safe (if loose) per-request array-length bound checked before the
// more precise total-recipient-count check below.
const MAX_BATCHES = MAX_AIRDROP_RECIPIENTS;

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

interface BatchInput {
  outcome: "success" | "failed" | "disputed";
  transactionId: string | null;
  recipientWallets: string[];
}

function isValidBatch(value: unknown): value is BatchInput {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  if (b.outcome !== "success" && b.outcome !== "failed" && b.outcome !== "disputed") return false;
  if (b.transactionId !== null && typeof b.transactionId !== "string") return false;
  if (!Array.isArray(b.recipientWallets) || b.recipientWallets.length === 0) return false;
  if (!b.recipientWallets.every((w) => isValidPublicKey(w))) return false;
  if ((b.outcome === "success" || b.outcome === "disputed") && !b.transactionId) return false;
  return true;
}

// ─── GET: an authenticated creator's own airdrop history. Always
// scoped to the caller - recipient wallet lists are private, not a
// public browse list (unlike staking pools/IDO campaigns). ──────────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const { cursor, limit } = parseCursorParams(req);
    const launchedTokenId = req.nextUrl.searchParams.get("launchedTokenId");

    const airdrops = await prisma.airdrop.findMany({
      where: { creatorId: userId, ...(launchedTokenId ? { launchedTokenId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        recipients: { select: { walletAddress: true, status: true, transactionId: true } },
      },
    });

    const { items, nextCursor } = buildPage(airdrops, limit);
    return jsonWithDecimalStrings({ airdrops: items, nextCursor });
  } catch (error) {
    console.error("Error fetching airdrop history:", error);
    return NextResponse.json({ error: "Failed to fetch airdrop history" }, { status: 500 });
  }
}

// ─── POST: record a just-completed airdrop run. Every "success" batch
// is independently re-verified on-chain before being trusted - a
// client-claimed success whose transaction doesn't actually show the
// claimed recipients credited is downgraded to FAILED, never recorded
// as-is. ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "airdrop-record" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { launchedTokenId, senderWalletAddress, amountPerRecipientRaw, batches } = body;

    if (typeof launchedTokenId !== "string" || !launchedTokenId) {
      return NextResponse.json({ error: "launchedTokenId is required." }, { status: 400 });
    }
    if (!isValidPublicKey(senderWalletAddress)) {
      return NextResponse.json({ error: "A valid senderWalletAddress is required." }, { status: 400 });
    }
    const amountStr = typeof amountPerRecipientRaw === "string" ? amountPerRecipientRaw.trim() : "";
    if (!/^[1-9]\d*$/.test(amountStr) || amountStr.length > 30) {
      return NextResponse.json({ error: "Invalid amountPerRecipientRaw." }, { status: 400 });
    }
    const amountRaw = BigInt(amountStr);

    if (!Array.isArray(batches) || batches.length === 0 || batches.length > MAX_BATCHES || !batches.every(isValidBatch)) {
      return NextResponse.json({ error: "Invalid batches." }, { status: 400 });
    }
    const totalRecipients = batches.reduce((sum, b: BatchInput) => sum + b.recipientWallets.length, 0);
    if (totalRecipients > MAX_AIRDROP_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients. Maximum allowed is ${MAX_AIRDROP_RECIPIENTS}.`, max: MAX_AIRDROP_RECIPIENTS, received: totalRecipients },
        { status: 400 }
      );
    }

    const launchedToken = await prisma.launchedToken.findUnique({ where: { id: launchedTokenId } });
    if (!launchedToken || launchedToken.status !== "COMPLETED" || !launchedToken.mintAddress) {
      return NextResponse.json({ error: "Token not found or not yet minted." }, { status: 404 });
    }
    // ⚠️ SECURITY: only the token's own creator may record an airdrop
    // for it - otherwise anyone could fabricate distribution history
    // against someone else's token.
    if (launchedToken.creatorId !== userId) {
      return NextResponse.json({ error: "Only the token's creator can record an airdrop for it." }, { status: 403 });
    }

    const recipientRows: Array<{ walletAddress: string; status: "SUCCESS" | "FAILED" | "DISPUTED"; transactionId: string | null }> = [];

    for (const batch of batches as BatchInput[]) {
      if (batch.outcome === "failed") {
        for (const walletAddress of batch.recipientWallets) {
          recipientRows.push({ walletAddress, status: "FAILED", transactionId: batch.transactionId });
        }
        continue;
      }
      if (batch.outcome === "disputed") {
        for (const walletAddress of batch.recipientWallets) {
          recipientRows.push({ walletAddress, status: "DISPUTED", transactionId: batch.transactionId });
        }
        continue;
      }

      // outcome === "success" - never trust this label on its own.
      try {
        const verification = await verifyAirdropBatchTransaction({
          transactionId: batch.transactionId as string,
          mintAddress: launchedToken.mintAddress,
          senderWalletAddress,
          amountPerRecipientRaw: amountRaw,
          claimedRecipientWallets: batch.recipientWallets,
        });
        const verifiedSet = new Set(verification.verifiedRecipients.map((r) => r.walletAddress));
        for (const walletAddress of batch.recipientWallets) {
          recipientRows.push({
            walletAddress,
            status: verifiedSet.has(walletAddress) ? "SUCCESS" : "FAILED",
            transactionId: batch.transactionId,
          });
        }
      } catch (verifyError) {
        console.error("Airdrop batch verification failed, recording as FAILED:", verifyError);
        for (const walletAddress of batch.recipientWallets) {
          recipientRows.push({ walletAddress, status: "FAILED", transactionId: batch.transactionId });
        }
      }
    }

    try {
      const airdrop = await prisma.$transaction(async (tx) => {
        const created = await tx.airdrop.create({
          data: {
            launchedTokenId,
            creatorId: userId,
            senderWalletAddress,
            amountPerRecipientRaw: amountStr,
          },
        });
        await tx.airdropRecipient.createMany({
          data: recipientRows.map((r) => ({ airdropId: created.id, ...r })),
        });
        return created;
      });

      const full = await prisma.airdrop.findUnique({
        where: { id: airdrop.id },
        include: { recipients: { select: { walletAddress: true, status: true, transactionId: true } } },
      });
      return jsonWithDecimalStrings({ airdrop: full }, { status: 201 });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "One or more of these transactions have already been recorded for another airdrop." }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    console.error("Airdrop recording error:", error);
    return NextResponse.json({ error: "Failed to record airdrop. Please try again." }, { status: 500 });
  }
}
