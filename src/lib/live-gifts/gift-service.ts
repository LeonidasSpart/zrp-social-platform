import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { checkPaymentSender } from "@/lib/payment-sender";
import { emitToLiveAudioRoom, emitToLiveVideoRoom } from "@/lib/socket-emit";
import { LiveGiftErrors } from "./errors";
import {
  CHARITY_PERCENTAGE,
  COIN_VALUE_USDC,
  MAX_COIN_PURCHASE_USDC,
  MAX_GIFT_QUANTITY,
  MIN_COIN_PURCHASE_USDC,
  PLATFORM_FEE_RATE,
} from "./constants";

export type LiveRoomType = "AUDIO" | "VIDEO";

/**
 * Catalog for the client's gift panel. Display name/description/
 * localization are resolved client-side from `key` - see schema.prisma's
 * comment on GiftDefinition.
 */
export async function getGiftCatalog() {
  return prisma.giftDefinition.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function getOrCreateWallet(userId: string) {
  const existing = await prisma.coinWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  // A concurrent first-purchase race can lose the create to the
  // userId unique constraint - re-read rather than throw, same
  // "lost create race just retries" pattern as reserveAiMessage().
  try {
    return await prisma.coinWallet.create({ data: { userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.coinWallet.findUniqueOrThrow({ where: { userId } });
    }
    throw err;
  }
}

export async function getCoinBalance(userId: string): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  return wallet.balance;
}

export interface PurchaseCoinsInput {
  userId: string;
  transactionId: string;
}

export interface PurchaseCoinsResult {
  coinsCredited: number;
  balance: number;
}

/**
 * Tops up a user's integer coin balance with ONE real on-chain USDC
 * payment, verified exactly like /api/creator/tip/route.ts (same
 * verifyUsdcTransaction call, same checkPaymentSender binding, same
 * shared ConsumedPaymentTransaction idempotency guard claimed inside
 * the same atomic transaction that credits the wallet) - never a
 * second, weaker verification path for a second kind of payment.
 */
export async function purchaseCoins(input: PurchaseCoinsInput): Promise<PurchaseCoinsResult> {
  const { userId, transactionId } = input;

  if (!transactionId || typeof transactionId !== "string") {
    throw LiveGiftErrors.validation("Transaction ID is required.");
  }

  const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId } });
  if (existingClaim) throw LiveGiftErrors.duplicateTransaction();

  // Dynamic import: see tip route's own comment - importing "@/lib/solana"
  // at module level breaks Next.js build-time evaluation.
  const { verifyUsdcTransaction } = await import("@/lib/solana");

  let usdcAmount: number;
  let fromAddress: string | null | undefined;
  try {
    const result = await verifyUsdcTransaction(transactionId);
    if (!result || !result.valid) throw LiveGiftErrors.invalidTransaction();
    usdcAmount = Number(result.amount);
    fromAddress = result.from;
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code) throw err; // already a LiveAudioError
    throw LiveGiftErrors.invalidTransaction();
  }

  if (!Number.isFinite(usdcAmount) || usdcAmount < MIN_COIN_PURCHASE_USDC || usdcAmount > MAX_COIN_PURCHASE_USDC) {
    throw LiveGiftErrors.validation("Invalid purchase amount.");
  }

  const senderError = await checkPaymentSender(userId, fromAddress);
  if (senderError) throw LiveGiftErrors.validation(senderError);

  const coinsCredited = Math.floor(usdcAmount / COIN_VALUE_USDC);
  if (coinsCredited < 1) throw LiveGiftErrors.validation("Invalid purchase amount.");

  const wallet = await getOrCreateWallet(userId);
  const purchaseId = randomUUID();

  try {
    await prisma.$transaction([
      prisma.consumedPaymentTransaction.create({
        data: { transactionId, paymentType: "coin_purchase", paymentId: purchaseId },
      }),
      prisma.coinPurchase.create({
        data: {
          id: purchaseId,
          userId,
          coinWalletId: wallet.id,
          usdcAmount,
          coinsCredited,
          transactionId,
          status: "COMPLETED",
        },
      }),
      prisma.coinWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: coinsCredited } },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw LiveGiftErrors.duplicateTransaction();
    }
    throw err;
  }

  const updated = await prisma.coinWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  return { coinsCredited, balance: updated.balance };
}

export interface SendGiftInput {
  senderId: string;
  roomType: LiveRoomType;
  roomId: string;
  giftKey: string;
  quantity: number;
  idempotencyKey: string;
}

export interface SendGiftResult {
  transactionId: string;
  giftKey: string;
  quantity: number;
  totalCoins: number;
  senderId: string;
  recipientId: string;
  createdAt: Date;
}

/**
 * Spends coins on a gift inside a live room - the real-time,
 * server-authoritative core of ZRP Live Gifts.
 *
 * ⚠️ SECURITY: every value that ends up in the ledger is read from the
 * database or computed here, never trusted from the caller - price
 * (GiftDefinition.priceCoins), recipient (room.hostId), room liveness
 * (room.status), and sender membership (an active participant row) are
 * all re-verified on every call. The debit + ledger insert + creator
 * credit happen in ONE interactive transaction: the conditional
 * updateMany (`balance >= totalCoins`) is what Postgres's row lock
 * makes correct under concurrent sends draining the same wallet - see
 * reserveAiMessage()'s comment on the identical pattern - and throwing
 * inside the callback rolls the whole transaction back, so an
 * insufficient-balance failure can never leave a half-applied ledger
 * row or a half-credited creator balance.
 */
export async function sendGift(input: SendGiftInput): Promise<SendGiftResult> {
  const { senderId, roomType, roomId, giftKey, quantity, idempotencyKey } = input;

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw LiveGiftErrors.validation("idempotencyKey is required.");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_GIFT_QUANTITY) {
    throw LiveGiftErrors.invalidQuantity();
  }
  if (!giftKey || typeof giftKey !== "string") {
    throw LiveGiftErrors.giftNotFound();
  }

  // ⚠️ SECURITY: a UserGiftPolicy row only ever EXISTS when an admin has
  // restricted this specific user (see src/app/api/admin/live-gifts/
  // eligibility/[userId]/route.ts) - absence means "no restriction", so
  // this is a single extra indexed lookup for the overwhelming majority
  // of sends, never a second table most users even have a row in. This
  // is the actual enforcement point: the admin eligibility pages only
  // ever DISPLAY this flag, they never gate the send by themselves.
  const policy = await prisma.userGiftPolicy.findUnique({ where: { userId: senderId } });
  if (policy && !policy.canSendGifts) throw LiveGiftErrors.giftRestricted();

  const giftDefinition = await prisma.giftDefinition.findUnique({ where: { key: giftKey } });
  if (!giftDefinition) throw LiveGiftErrors.giftNotFound();
  if (!giftDefinition.enabled) throw LiveGiftErrors.giftDisabled();

  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveGiftErrors.roomNotFound();
  if (room.status !== "LIVE") throw LiveGiftErrors.roomNotLive();

  const recipientId = room.hostId;
  if (recipientId === senderId) throw LiveGiftErrors.cannotGiftSelf();

  const activeParticipant =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({
          where: { roomId, userId: senderId, leftAt: null, removedAt: null },
        })
      : await prisma.liveVideoParticipant.findFirst({
          where: { roomId, userId: senderId, leftAt: null, removedAt: null },
        });
  if (!activeParticipant) throw LiveGiftErrors.notParticipant();

  if (await isBlockedEitherWay(recipientId, senderId)) throw LiveGiftErrors.blocked();

  const creatorProfile = await prisma.creatorProfile.findUnique({ where: { userId: recipientId } });
  // A host with no CreatorProfile row at all can't receive earnings -
  // same "not found" surface as an unavailable room, no separate
  // enumeration signal needed since the caller already knows the room.
  if (!creatorProfile) throw LiveGiftErrors.roomNotFound();

  const unitPriceCoins = giftDefinition.priceCoins;
  const totalCoins = unitPriceCoins * quantity;

  const grossUsdc = new Prisma.Decimal(totalCoins).times(COIN_VALUE_USDC);
  const platformFee = grossUsdc.times(PLATFORM_FEE_RATE);
  const charityAmount = platformFee.times(CHARITY_PERCENTAGE);
  const creatorAmount = grossUsdc.minus(platformFee);

  let giftTxRow;
  try {
    giftTxRow = await prisma.$transaction(async (tx) => {
      const debited = await tx.coinWallet.updateMany({
        where: { userId: senderId, balance: { gte: totalCoins } },
        data: { balance: { decrement: totalCoins } },
      });
      if (debited.count !== 1) throw LiveGiftErrors.insufficientBalance();

      const row = await tx.liveGiftTransaction.create({
        data: {
          idempotencyKey,
          senderId,
          recipientId,
          giftDefinitionId: giftDefinition.id,
          unitPriceCoins,
          quantity,
          totalCoins,
          creatorProfileId: creatorProfile.id,
          platformFee,
          charityAmount,
          creatorAmount,
          liveAudioRoomId: roomType === "AUDIO" ? roomId : null,
          liveVideoRoomId: roomType === "VIDEO" ? roomId : null,
        },
      });

      await tx.creatorProfile.update({
        where: { id: creatorProfile.id },
        data: {
          totalEarnings: { increment: creatorAmount },
          balance: { increment: creatorAmount },
        },
      });

      return row;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw LiveGiftErrors.duplicateTransaction();
    }
    throw err;
  }

  // Broadcast + notification happen strictly AFTER a successful commit -
  // a failed/rolled-back transaction above never reaches this point, so
  // a client can never see a gift animation for a transaction that
  // didn't actually happen.
  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-gift:sent", {
    transactionId: giftTxRow.id,
    senderId,
    giftKey,
    quantity,
    totalCoins,
  });

  try {
    if (!(await isBlockedEitherWay(recipientId, senderId))) {
      await prisma.notification.create({
        data: { userId: recipientId, fromUserId: senderId, type: "LIVE_GIFT" },
      });
    }
  } catch (notifyError) {
    console.error("Live gift notification failed:", notifyError);
  }

  return {
    transactionId: giftTxRow.id,
    giftKey,
    quantity,
    totalCoins,
    senderId,
    recipientId,
    createdAt: giftTxRow.createdAt,
  };
}

export async function getGiftHistoryForCreator(userId: string, limit = 50) {
  const creatorProfile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!creatorProfile) return [];
  return prisma.liveGiftTransaction.findMany({
    where: { creatorProfileId: creatorProfile.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    include: {
      giftDefinition: { select: { key: true, iconUrl: true } },
      sender: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
}
