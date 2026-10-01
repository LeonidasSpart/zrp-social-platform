import { Prisma, ReferralCommissionSource } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * ZRP Launchpad affiliate/referral program.
 *
 * The Ambassador program already has everything needed to *identify* a
 * referral (AmbassadorProfile.invitationCode -> /signup?ref=<code>,
 * already classified as signupSource "REFERRAL" by
 * src/app/api/auth/register/route.ts) - what it never had was a way to
 * credit the referring ambassador back when that signup later generates
 * real platform revenue (see AmbassadorProfile.invitationCode's own
 * comment in schema.prisma). This module is that missing half.
 *
 * Commission is paid out of ZRP's own collected launchpad fees (today:
 * only the token-creation fee), never out of user deposits that pass
 * through the platform to a vesting/staking pool - those are never ZRP's
 * money to share. Commission is credited straight into the ambassador's
 * existing CreatorProfile.balance, the exact same USDC balance tips and
 * premium-post revenue already feed, so it is withdrawable through the
 * existing, already-audited WithdrawalRequest flow (src/lib/withdrawals.ts,
 * /creator/dashboard) - no new payout code, no new place for funds to get
 * stuck.
 */

export const REFERRAL_COMMISSION_RATE = 0.15;

/**
 * Records that `referredUserId` signed up via `ambassadorProfileId`'s
 * invitation link. Call this inside the same transaction as the user's
 * creation (see register/route.ts). Attribution is permanent and
 * first-touch: the unique constraint on Referral.referredUserId means a
 * given account can only ever be attributed once, so this is safe to call
 * exactly once per signup and never needs a pre-check.
 */
export async function attributeReferral(
  tx: Prisma.TransactionClient,
  ambassadorProfileId: string,
  referredUserId: string
): Promise<void> {
  await tx.referral.create({ data: { ambassadorProfileId, referredUserId } });
}

/**
 * Credits REFERRAL_COMMISSION_RATE of `feeAmount` (USDC) to the ambassador
 * who referred `referredUserId`, if any, and if that ambassador is
 * currently in good standing (status APPROVED - re-checked here, not at
 * attribution time, so a since-suspended ambassador's existing referrals
 * simply stop earning without any retroactive cleanup). A no-op, not an
 * error, when there is no referral or the referrer isn't APPROVED.
 *
 * Idempotent per (sourceType, sourceId): the unique constraint on
 * ReferralCommission is the actual race-proof guard, so this is safe to
 * call more than once for the same fee event (e.g. a retried request) -
 * a duplicate call simply credits nothing the second time. Never throws:
 * commission crediting is best-effort bookkeeping layered on top of an
 * already-successful, already-paid fee event, so a failure here must
 * never fail the caller's own response.
 */
export async function creditReferralCommission(
  sourceType: ReferralCommissionSource,
  sourceId: string,
  referredUserId: string,
  feeAmount: number
): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId },
      include: { ambassadorProfile: { select: { userId: true, status: true } } },
    });
    if (!referral || referral.ambassadorProfile.status !== "APPROVED") return;

    // Round to USDC's 6 decimals - feeAmount itself already came from an
    // on-chain-verified transfer, so this only guards against binary
    // float drift in the multiplication itself.
    const commissionAmount = Math.round(feeAmount * REFERRAL_COMMISSION_RATE * 1e6) / 1e6;
    if (commissionAmount <= 0) return;

    await prisma.$transaction([
      prisma.referralCommission.create({
        data: { referralId: referral.id, sourceType, sourceId, feeAmount, commissionAmount },
      }),
      prisma.creatorProfile.upsert({
        where: { userId: referral.ambassadorProfile.userId },
        create: {
          userId: referral.ambassadorProfile.userId,
          totalEarnings: commissionAmount,
          balance: commissionAmount,
        },
        update: {
          totalEarnings: { increment: commissionAmount },
          balance: { increment: commissionAmount },
        },
      }),
    ]);
  } catch (err: unknown) {
    // P2002 here means this exact (sourceType, sourceId) was already
    // credited - an expected, harmless race with a retry, not a bug.
    if ((err as { code?: string } | null)?.code === "P2002") return;
    console.error("Referral commission crediting failed:", err);
  }
}
