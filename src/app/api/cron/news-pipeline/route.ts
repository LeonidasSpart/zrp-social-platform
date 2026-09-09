import { NextRequest, NextResponse } from "next/server";
import { runPipelineCycle } from "@/lib/news/pipeline";

export const dynamic = "force-dynamic";

// The pipeline does real outbound work and can spend a few minutes on a
// large cycle. Next's default serverless timeout is far shorter than
// that on some hosts, so ask for the longest window the platform allows.
export const maxDuration = 300;

/**
 * GET /api/cron/news-pipeline
 *
 * Runs one ZRP News Network editorial cycle: publish what is due, poll
 * due sources, summarise, then plan the next window.
 *
 * Same fail-closed CRON_SECRET auth as the other cron routes: a missing
 * CRON_SECRET rejects every request rather than leaving a publishing
 * endpoint open to anyone who finds the URL. Between this and the
 * `paused` setting (which ships true), there are two independent things
 * that must be deliberately turned on before anything is ever posted.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPipelineCycle({ trigger: "cron" });

    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News pipeline cycle failed:", error);
    return NextResponse.json(
      { success: false, error: "News pipeline cycle failed" },
      { status: 500 }
    );
  }
}
