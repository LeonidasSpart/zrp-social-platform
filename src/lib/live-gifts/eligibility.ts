import { prisma } from "@/lib/db";

/**
 * Server-calculated "can this user send a gift right now" check for the
 * admin Gift Eligibility page (Admin -> Live -> Gift Eligibility). This is
 * a READ-ONLY, display-only computation - it mirrors the real checks
 * gift-service.ts's sendGift() makes, it does not replace them. The actual
 * enforcement for ACCOUNT_SUSPENDED/GIFT_RESTRICTED/room membership lives
 * in sendGift() itself (and, for GIFT_RESTRICTED specifically, is backed
 * by the same UserGiftPolicy row this function reads) - nothing here
 * should ever be trusted as a client-side or admin-side permission gate.
 *
 * NO_COINS is deliberately NOT a restriction: it only means the user
 * can't afford a gift with their current balance right this moment - a
 * coin purchase clears it instantly, so it's never shown or treated as a
 * standing block the way ACCOUNT_SUSPENDED/GIFT_RESTRICTED are.
 */
export type GiftEligibilityReason =
  | "ACCOUNT_SUSPENDED"
  | "NO_ACTIVE_ACCOUNT"
  | "GIFT_RESTRICTED"
  | "NO_COINS"
  | "ROOM_NOT_ELIGIBLE"
  | "ELIGIBLE";

export interface GiftEligibility {
  userId: string;
  eligible: boolean;
  reason: GiftEligibilityReason;
  accountStatus: "ACTIVE" | "SUSPENDED" | "DELETED";
  giftRestricted: boolean;
  restrictionReason: string | null;
  coinBalance: number;
  lastGiftAt: Date | null;
  lastCoinPurchaseAt: Date | null;
  inLiveRoom: boolean;
}

/**
 * Checked in this exact precedence order - the first matching condition
 * is the reason reported, even when several are simultaneously true (a
 * suspended user with zero coins is reported as ACCOUNT_SUSPENDED, the
 * more fundamental and more actionable-for-support reason).
 */
export async function computeGiftEligibility(userId: string): Promise<GiftEligibility> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { banned: true, deletionRequestedAt: true, emailVerified: true },
  });

  const [policy, wallet, lastGift, lastPurchase, activeAudio, activeVideo] = await Promise.all([
    prisma.userGiftPolicy.findUnique({ where: { userId } }),
    prisma.coinWallet.findUnique({ where: { userId } }),
    prisma.liveGiftTransaction.findFirst({
      where: { senderId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.coinPurchase.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.liveAudioParticipant.findFirst({
      where: { userId, leftAt: null, removedAt: null },
      select: { id: true },
    }),
    prisma.liveVideoParticipant.findFirst({
      where: { userId, leftAt: null, removedAt: null },
      select: { id: true },
    }),
  ]);

  const accountStatus: GiftEligibility["accountStatus"] = !user
    ? "DELETED"
    : user.banned
      ? "SUSPENDED"
      : "ACTIVE";

  const coinBalance = wallet?.balance ?? 0;
  const inLiveRoom = Boolean(activeAudio || activeVideo);
  const giftRestricted = Boolean(policy && !policy.canSendGifts);

  let reason: GiftEligibilityReason;
  if (!user || !user.emailVerified) {
    reason = "NO_ACTIVE_ACCOUNT";
  } else if (accountStatus === "SUSPENDED") {
    reason = "ACCOUNT_SUSPENDED";
  } else if (giftRestricted) {
    reason = "GIFT_RESTRICTED";
  } else if (coinBalance < 1) {
    reason = "NO_COINS";
  } else if (!inLiveRoom) {
    reason = "ROOM_NOT_ELIGIBLE";
  } else {
    reason = "ELIGIBLE";
  }

  return {
    userId,
    eligible: reason === "ELIGIBLE",
    reason,
    accountStatus,
    giftRestricted,
    restrictionReason: policy?.reason ?? null,
    coinBalance,
    lastGiftAt: lastGift?.createdAt ?? null,
    lastCoinPurchaseAt: lastPurchase?.createdAt ?? null,
    inLiveRoom,
  };
}
