import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Public charity transparency endpoint. Two genuinely different numbers,
// kept clearly separate rather than blended into one figure:
//
// - "committed": automatically computed from the real charityAmount
//   already recorded on completed Tip/PremiumPurchase transactions
//   (35% of ZRP's platform fee on each, per CHARITY_PERCENTAGE in
//   src/app/api/creator/tip and .../premium-purchase). This is what the
//   35% policy owes so far - not proof it has been paid out.
//
// - "disbursed": the sum of real CharityDisbursement records an admin
//   has entered after ZRP actually sent money to a beneficiary. Empty
//   until a real disbursement is recorded - never estimated or backfilled.
//
// force-dynamic: this sandbox's build has no DB connection (only
// Railway's production runtime does), matching sitemap.ts's existing fix.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const CAUSES = ["orphanages", "schools", "hospitals", "climate"] as const;

export async function GET() {
  try {
    const [tipAgg, purchaseAgg, disbursements] = await Promise.all([
      prisma.tip.aggregate({
        where: { status: "COMPLETED" },
        _sum: { charityAmount: true },
      }),
      prisma.premiumPurchase.aggregate({
        where: { status: "COMPLETED" },
        _sum: { charityAmount: true },
      }),
      prisma.charityDisbursement.findMany({
        orderBy: { disbursedAt: "desc" },
        select: {
          id: true,
          beneficiaryName: true,
          cause: true,
          amount: true,
          currency: true,
          disbursedAt: true,
          note: true,
          proofUrl: true,
        },
      }),
    ]);

    const committedUsdc = new Prisma.Decimal(tipAgg._sum.charityAmount ?? 0).plus(
      new Prisma.Decimal(purchaseAgg._sum.charityAmount ?? 0)
    );

    const disbursedByCause = Object.fromEntries(CAUSES.map((c) => [c, 0])) as Record<
      (typeof CAUSES)[number],
      number
    >;
    let disbursedTotal = 0;
    for (const d of disbursements) {
      const amt = Number(d.amount);
      disbursedTotal += amt;
      if (d.cause in disbursedByCause) {
        disbursedByCause[d.cause as (typeof CAUSES)[number]] += amt;
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      committed: {
        amount: committedUsdc.toNumber(),
        currency: "USDC",
        note: "Computed automatically from completed tips and premium content purchases (35% of ZRP's platform fee on each). Reflects what the charity commitment owes so far, not a confirmed payout.",
      },
      disbursed: {
        total: disbursedTotal,
        byCause: disbursedByCause,
        records: disbursements.map((d) => ({
          id: d.id,
          beneficiaryName: d.beneficiaryName,
          cause: d.cause,
          amount: Number(d.amount),
          currency: d.currency,
          disbursedAt: d.disbursedAt.toISOString(),
          note: d.note,
          proofUrl: d.proofUrl,
        })),
      },
    });
  } catch (error) {
    console.error("Charity transparency error:", error);
    return NextResponse.json(
      { error: "Unable to load charity transparency data" },
      { status: 500 }
    );
  }
}
