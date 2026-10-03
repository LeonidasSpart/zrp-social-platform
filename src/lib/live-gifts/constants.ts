/**
 * Fixed coin <-> USDC peg. 1 coin = $0.01 USDC. Coins are purchased
 * with real on-chain USDC (CoinPurchase, verified like Tip) and spent
 * instantly inside a live room (LiveGiftTransaction); this constant is
 * what converts a gift's integer coin price back into the USDC amount
 * credited to the recipient's CreatorProfile, using the same
 * platformFee/charityAmount/creatorAmount split Tip already uses.
 *
 * A plain number (not Decimal) is safe here only because it's a
 * compile-time constant multiplied through Prisma.Decimal arithmetic
 * at every call site (see gift-service.ts) - never used for direct
 * floating-point money math.
 */
export const COIN_VALUE_USDC = 0.01;

/** Same split Tip uses (src/app/api/creator/tip/route.ts) - gifts route through the one earnings rail, not a second one with its own economics. */
export const PLATFORM_FEE_RATE = 0.1;
export const CHARITY_PERCENTAGE = 0.35;

export const MIN_COIN_PURCHASE_USDC = 0.5;
export const MAX_COIN_PURCHASE_USDC = 1_000_000;

export const MAX_GIFT_QUANTITY = 100;
