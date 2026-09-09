import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";
import { runPipelineCycle } from "@/lib/news/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/news-network/run
 *
 * Runs one editorial cycle now, outside the schedule.
 *
 * Rate limited to a handful per hour on top of the pipeline's own
 * distributed lock: an admin holding down a button must not be able to
 * turn into a publishing loop. Respects `paused` exactly like the cron
 * route - this is not a way to publish while the system is paused.
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const limit = await rateLimit(request, { limit: 4, window: 3600, type: "news-cycle" });
  if (!limit.success) return limit.response;

  try {
    const result = await runPipelineCycle({ trigger: "manual" });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.manual_cycle",
      targetType: "NewsJobRun",
      targetId: result.jobRunId ?? undefined,
      metadata: {
        ran: result.ran,
        reason: result.reason,
        published: result.published,
        scheduled: result.scheduled,
      },
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("ZRP News admin manual cycle error:", error);
    return NextResponse.json({ success: false, error: "Cycle failed" }, { status: 500 });
  }
}
