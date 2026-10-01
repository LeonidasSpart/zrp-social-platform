import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { processDueBroadcastsForCronTick } from "@/lib/announcements/dispatch";

export const dynamic = "force-dynamic";

/**
 * Crash-safety net for the broadcast system, following the existing
 * src/app/api/cron/* convention (same CRON_SECRET auth as every other
 * cron route - see src/lib/cron-auth.ts) rather than introducing a new
 * job queue: this codebase has no BullMQ/Bee-Queue/Agenda-style
 * infrastructure today (confirmed by inspecting package.json), and
 * external cron hitting routes like this one is how all scheduled
 * background work already happens (publish-scheduled-posts,
 * expire-subscriptions, etc).
 *
 * Each tick does two things, both bounded and idempotent:
 *  1. Promotes any SCHEDULED announcement whose scheduledAt has passed
 *     to SENDING (via the same atomic beginSending() transition the
 *     explicit Send button uses - see dispatch.ts), so a scheduled
 *     announcement fires even if no admin browser is open.
 *  2. Resumes a bounded number of batches for every still-SENDING
 *     announcement. This is the actual safety net: if the in-process
 *     fire-and-forget run started by POST .../send dies mid-broadcast
 *     (a deploy, a crash, a restart), the announcement is left in
 *     SENDING with a valid lastProcessedUserId cursor, and the next
 *     tick of this route picks it back up exactly where it left off -
 *     no batch is re-sent (Notification's unique constraint +
 *     createMany's skipDuplicates) and no batch is skipped.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueBroadcastsForCronTick();
    return NextResponse.json({
      message: `Promoted ${result.promoted.length} scheduled announcement(s); advanced ${result.processed.length} sending announcement(s).`,
      ...result,
    });
  } catch (error) {
    console.error("[broadcast cron] tick failed:", error);
    return NextResponse.json({ error: "Broadcast cron tick failed" }, { status: 500 });
  }
}
