import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// A real user's own charity impact: the sum of the real charityAmount
// already recorded on their own completed Tip and PremiumPurchase
// transactions (35% of ZRP's platform fee on each - see
// CHARITY_PERCENTAGE in api/creator/tip and .../premium-purchase),
// following the exact same computation api/transparency/charity already
// uses platform-wide, just scoped to one person's own activity instead
// of every completed transaction.
//
// This exists to replace src/app/profile/[username]/page.tsx's previous
// `impactMeals = Math.floor(Math.random() * 50) + 5` - a number with no
// connection to anything real, regenerated on every page load. There is
// no established USD-to-"meals" (or any other unit) conversion rate
// anywhere in this codebase (api/transparency/charity itself reports
// real USDC amounts, never a converted unit), so inventing one here
// would just be trading one fabricated number for another. The real,
// honest figure is the dollar amount itself.
export async function getUserCharityContributionUsdc(userId: string): Promise<number> {
  const [tipAgg, purchaseAgg] = await Promise.all([
    prisma.tip.aggregate({
      where: { senderId: userId, status: "COMPLETED" },
      _sum: { charityAmount: true },
    }),
    prisma.premiumPurchase.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { charityAmount: true },
    }),
  ]);

  return new Prisma.Decimal(tipAgg._sum.charityAmount ?? 0)
    .plus(new Prisma.Decimal(purchaseAgg._sum.charityAmount ?? 0))
    .toNumber();
}
