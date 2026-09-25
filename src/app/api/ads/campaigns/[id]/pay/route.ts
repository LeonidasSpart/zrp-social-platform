export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { canTransition } from "@/lib/ads/lifecycle";
import { checkPaymentSender } from "@/lib/payment-sender";

// Statuses from which the "system" actor may move a campaign to ACTIVE on
// a verified payment (see canTransition("system", ..., "ACTIVE")).
const PAYABLE_STATUSES = ["PAYMENT_PENDING", "PAYMENT_FAILED"] as const;

// ─── POST: fund an approved campaign's budget with a verified on-chain
// USDC payment. This is the step that was entirely missing before - an
// advertiser could previously type any budgetTotal into the campaign
// form and it was simply trusted, with no money ever actually changing
// hands. Follows the exact same "client submits a signature, server
// verifies it on-chain" pattern already proven in
// src/app/api/creator/tip/route.ts, including the shared
// ConsumedPaymentTransaction dedupe table so a signature can never fund
// two campaigns, or a campaign and a tip, etc. ──────────────────────────
class CampaignNoLongerPayableError extends Error {}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  // Real RPC + DB work per call, same cap as the tip route.
  const limit = await rateLimit(req, { limit: 10, window: 60, type: "ads-campaign-pay" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Funding a campaign is real money leaving the advertiser's wallet -
  // the same store-policy-sensitive surface as tips/premium purchases/
  // plan upgrades, and campaign creation/management is already excluded
  // from the native app entirely (see ios-native/PARITY.md). Block it
  // here too rather than only in the UI that never renders it natively.
  const nativeBlock = rejectNativePayment(req);
  if (nativeBlock) return nativeBlock;

  try {
    const existing = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: { advertiserId: true, status: true, budgetTotal: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!canTransition("system", existing.status, "ACTIVE")) {
      return NextResponse.json(
        { error: "This campaign isn't awaiting payment." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { transactionId } = body;
    if (!transactionId || typeof transactionId !== "string") {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    // ⚠️ SECURITY: a signature is only ever allowed to credit one payment
    // record of any type, ever - checked against the single shared
    // ConsumedPaymentTransaction table, same as tips/premium purchases/
    // help contributions. This pre-check is only the fast path; the
    // race-proof guard is the table's own primary key, claimed inside
    // the same transaction as the campaign update below.
    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({
      where: { transactionId },
    });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    // Dynamic import - see creator/tip/route.ts for why: importing
    // @/lib/solana at module level breaks Next.js's build-time evaluation.
    const { verifyUsdcTransaction } = await import("@/lib/solana");

    let verifiedAmount: number;
    let fromAddress: string | undefined;
    try {
      const result = await verifyUsdcTransaction(transactionId);
      if (!result || !result.valid) {
        throw new Error("Invalid or pending transaction.");
      }
      verifiedAmount = Number(result.amount);
      fromAddress = result.from;
      if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        throw new Error("Could not determine the verified transaction amount.");
      }

      const budgetTotal = existing.budgetTotal.toNumber();
      // The advertiser must fund at least the full budget they committed
      // to at submission time - never trust a smaller amount and quietly
      // shrink the campaign's budget to match what actually arrived.
      if (verifiedAmount + 0.000001 < budgetTotal) {
        throw new Error(
          `Verified payment ($${verifiedAmount}) is less than the campaign budget ($${budgetTotal}).`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      // Record the failure so the advertiser sees why and can retry -
      // this does NOT consume the transaction ID (nothing was claimed),
      // so a genuinely valid signature that failed for a transient RPC
      // reason can still be resubmitted.
      //
      // ⚠️ Conditional on the campaign STILL being payable: verification
      // is a slow RPC round trip, and staff may have cancelled it (or the
      // advertiser cancelled it) meanwhile. An unconditional update used
      // to overwrite that CANCELLED with PAYMENT_FAILED - a status the
      // advertiser can pay out of - undoing a staff cancel.
      await prisma.adCampaign.updateMany({
        where: { id: params.id, status: { in: [...PAYABLE_STATUSES] } },
        data: { status: "PAYMENT_FAILED", paymentFailureReason: message.slice(0, 2000) },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // ⚠️ SECURITY: same sender binding as tips/premium purchases - a
    // payment sent from a wallet verified-linked to another account can't
    // be claimed here to fund this advertiser's campaign.
    const senderError = await checkPaymentSender(token.id as string, fromAddress);
    if (senderError) {
      return NextResponse.json({ error: senderError }, { status: 400 });
    }

    // ─── Claim the signature + activate the campaign atomically ───────
    //
    // ⚠️ The activation is a compare-and-swap on the status, not a blind
    // update: between the status check at the top of this handler and
    // here (a slow on-chain verification), staff may have cancelled the
    // campaign, or a second concurrent payment with a DIFFERENT signature
    // may already have activated it. A blind update re-activated a
    // staff-cancelled campaign, and let two payments both "fund" the
    // same campaign. If the campaign is no longer payable the whole
    // transaction (signature claim included) rolls back, so the
    // signature is not burned.
    let campaign;
    try {
      campaign = await prisma.$transaction(async (tx) => {
        await tx.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "ad_campaign", paymentId: params.id },
        });
        const activated = await tx.adCampaign.updateMany({
          where: { id: params.id, status: { in: [...PAYABLE_STATUSES] } },
          data: {
            status: "ACTIVE",
            paymentTransactionId: transactionId,
            paidAt: new Date(),
            paymentFailureReason: null,
          },
        });
        if (activated.count === 0) {
          throw new CampaignNoLongerPayableError();
        }
        return tx.adCampaign.findUniqueOrThrow({
          where: { id: params.id },
          omit: { adminNote: true },
        });
      });
    } catch (err: any) {
      if (err instanceof CampaignNoLongerPayableError) {
        return NextResponse.json(
          { error: "This campaign isn't awaiting payment." },
          { status: 409 }
        );
      }
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    console.log("Ad campaign funded:", { campaignId: params.id, transactionId, verifiedAmount, fromAddress });

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error processing ad campaign payment:", error);
    return NextResponse.json({ error: "Failed to process payment" }, { status: 500 });
  }
}
