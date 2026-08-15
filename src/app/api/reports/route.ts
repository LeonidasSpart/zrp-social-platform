import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 10 reports per 10 minutes - reports are meant to be rare
  // and deliberate, and this route previously had no protection at all,
  // meaning the same person could spam-report a single post or comment
  // an unlimited number of times.
  const limit = await rateLimit(req, { limit: 10, window: 600, type: "report-create" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { postId, commentId, reason, details } = await req.json();

    if (!reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    if (!postId && !commentId) {
      return NextResponse.json({ error: "Either postId or commentId is required" }, { status: 400 });
    }

    // ─── Prevent duplicate reports ────────────────────────────────────
    // Previously there was no check here at all - the same person could
    // submit the same report on the same post/comment an unlimited
    // number of times, inflating report counts and spamming moderators
    // with duplicates of something they've already reviewed once.
    // Scoped to "pending" specifically, so a genuinely new report is
    // still allowed once a prior one has actually been reviewed - e.g.
    // if the same post starts misbehaving again after being cleared.
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: session.user.id,
        status: "pending",
        ...(postId ? { postId } : { commentId }),
      },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "You've already reported this and it's still under review." },
        { status: 409 }
      );
    }

    const report = await prisma.report.create({
      data: {
        reporterId: session.user.id,
        postId: postId || null,
        commentId: commentId || null,
        reason,
        details: details || null,
        status: "pending",
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
