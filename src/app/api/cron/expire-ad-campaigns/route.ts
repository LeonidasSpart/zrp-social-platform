import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Before this route existed, nothing ever stopped a campaign once its
// endDate passed - the serve/impression/click routes already correctly
// exclude a campaign whose endDate is in the past from being served or
// billed (see the date-window check in ads/serve), but the campaign's
// own `status` column stayed ACTIVE/PAUSED/SUSPENDED forever, so the
// advertiser dashboard and admin queue kept showing it as live
// indefinitely and an admin had no signal that anything needed manual
// cleanup. Same CRON_SECRET auth as the other /api/cron/* routes -
// deliberately fails CLOSED if the env var is unset - and the same
// "time has come" shape as publish-scheduled-posts: a date column
// compared to now(), flipped via one batch updateMany, no per-row loop.
//
// Deliberately does not delete anything - COMPLETED preserves the full
// billing/audit history (AdImpression/AdClick rows, paymentTransactionId,
// budgetSpent) exactly as publish-scheduled-posts and every other
// lifecycle transition in this codebase does.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const result = await prisma.adCampaign.updateMany({
      where: {
        status: { in: ["ACTIVE", "PAUSED", "SUSPENDED", "PAYMENT_PENDING", "PAYMENT_FAILED"] },
        endDate: { lte: now },
      },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({ message: `Expired ${result.count} ad campaign(s) past their end date.` });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to expire ad campaigns" }, { status: 500 });
  }
}
