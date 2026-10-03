import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// jsonWithDecimals (toPlainJsonWithDecimalStrings) formats every Decimal
// via .toFixed(0) - correct for supply, a raw SPL base unit, but wrong
// for money-scale Decimal(18,6) fields like feeAmount, which it would
// truncate (e.g. 2.25 -> "2"). Those are converted to plain numbers here,
// upstream of that walk, so only `supply` still takes the string path.
function decimalToNumber(value: Prisma.Decimal | null): number {
  return value ? value.toNumber() : 0;
}

/*
 * ZRP Launchpad Phase 5: admin visibility.
 *
 * Every launchpad phase so far (token creation, vesting, staking,
 * referrals) built real revenue/activity with no admin-facing view of
 * any of it - an admin had no way to see how many tokens were launched,
 * how much fee revenue the platform actually collected, or whether a
 * given mint/vesting/staking action succeeded or failed. This is a
 * read-only visibility surface, not a moderation queue: nothing here
 * lets an admin approve/reject/edit a launchpad row (unlike
 * withdrawals) - tokens aren't user-generated content needing review,
 * and the fee/payout flows are already fully automated and
 * on-chain-verified.
 */

// GET /api/admin/launchpad - aggregate stats + paginated LaunchedToken list.
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { cursor, limit } = parseCursorParams(req);
    const statusFilter = req.nextUrl.searchParams.get("status");
    const where = statusFilter ? { status: statusFilter as "PENDING" | "COMPLETED" | "FAILED" } : {};

    const [tokens, statusCounts, feeRevenue, vestingCount, stakingPoolCount, referralCommissionPaid] =
      await Promise.all([
        prisma.launchedToken.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            mintAddress: true,
            name: true,
            symbol: true,
            imageUrl: true,
            supply: true,
            decimals: true,
            feeAmount: true,
            status: true,
            failureReason: true,
            createdAt: true,
            creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
          },
        }),
        prisma.launchedToken.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.launchedToken.aggregate({ where: { status: "COMPLETED" }, _sum: { feeAmount: true } }),
        prisma.vestingContract.count(),
        prisma.stakingPool.count(),
        prisma.referralCommission.aggregate({ _sum: { commissionAmount: true } }),
      ]);

    const { items, nextCursor } = buildPage(tokens, limit);

    const counts: Record<string, number> = { PENDING: 0, COMPLETED: 0, FAILED: 0 };
    for (const row of statusCounts) counts[row.status] = row._count._all;

    const tokensWithMoneyAsNumber = items.map((token) => ({
      ...token,
      feeAmount: decimalToNumber(token.feeAmount),
    }));

    return jsonWithDecimals({
      tokens: tokensWithMoneyAsNumber,
      nextCursor,
      stats: {
        tokensByStatus: counts,
        totalFeeRevenue: decimalToNumber(feeRevenue._sum.feeAmount),
        vestingContractCount: vestingCount,
        stakingPoolCount: stakingPoolCount,
        totalReferralCommissionPaid: decimalToNumber(referralCommissionPaid._sum.commissionAmount),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/launchpad error:", error);
    return NextResponse.json({ error: "Failed to load launchpad data" }, { status: 500 });
  }
}
