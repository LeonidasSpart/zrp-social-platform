import { NextRequest, NextResponse } from "next/server";
import { sendJ7Reminders } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

// Same CRON_SECRET-gated shape as every other /api/cron/* route. Safe to
// run as often as desired (hourly, per the other cron workflows) - the
// durable `reminderSentAt` claim inside sendJ7Reminders() guarantees at
// most one reminder per subscription billing period regardless of how
// often or how many overlapping instances invoke this.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendJ7Reminders();
    return NextResponse.json({
      message: `Checked ${result.checked} subscription(s) in the J-7 window, sent ${result.sent} reminder(s).`,
      ...result,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to send subscription reminders" }, { status: 500 });
  }
}
