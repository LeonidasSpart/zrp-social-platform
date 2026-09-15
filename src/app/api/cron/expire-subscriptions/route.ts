import { NextRequest, NextResponse } from "next/server";
import { expireDueSubscriptions } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

// Same CRON_SECRET-gated shape as every other /api/cron/* route (see
// publish-scheduled-posts, expire-ad-campaigns) - deliberately fails
// CLOSED if the env var is unset. All the actual idempotency/concurrency
// safety lives in expireDueSubscriptions() itself (per-row conditional
// updateMany claim inside its own transaction), so this route is a thin
// auth + invocation wrapper, matching the existing cron routes' shape.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireDueSubscriptions();
    return NextResponse.json({
      message: `Checked ${result.checked} due subscription(s), expired ${result.expired}.`,
      ...result,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to expire subscriptions" }, { status: 500 });
  }
}
