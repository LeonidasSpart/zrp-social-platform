import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

/**
 * GET /api/ambassadors/referrals
 *
 * The signed-in ambassador's own referral/commission summary - real
 * counts and real USDC amounts backed by Referral/ReferralCommission
 * rows, never estimated. A user with no AmbassadorProfile (or one that
 * has never referred anyone) gets honest zeros, not an error - matches
 * /api/ambassadors/me's "never fabricate" convention.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await prisma.ambassadorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { referralCount: 0, totalCommission: 0, recentReferrals: [] },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const [referralCount, commissionAgg, recentReferrals] = await Promise.all([
      prisma.referral.count({ where: { ambassadorProfileId: profile.id } }),
      prisma.referralCommission.aggregate({
        where: { referral: { ambassadorProfileId: profile.id } },
        _sum: { commissionAmount: true },
      }),
      prisma.referral.findMany({
        where: { ambassadorProfileId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          referredUser: { select: { username: true, avatarUrl: true } },
          commissions: { select: { commissionAmount: true, createdAt: true, sourceType: true } },
        },
      }),
    ]);

    return jsonWithDecimals(
      {
        referralCount,
        totalCommission: commissionAgg._sum.commissionAmount ?? 0,
        recentReferrals,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("GET /api/ambassadors/referrals error:", error);
    return NextResponse.json({ error: "Failed to load referral stats" }, { status: 500 });
  }
}
