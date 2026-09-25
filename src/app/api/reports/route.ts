import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

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
    const { postId, commentId, listingId, challengeId, opportunityId, campaignId, userId, reason, details } =
      await req.json();

    if (typeof reason !== "string" || !reason.trim() || reason.length > 200) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }
    if (details !== undefined && details !== null && (typeof details !== "string" || details.length > 2000)) {
      return NextResponse.json({ error: "Details must be text (up to 2000 characters)." }, { status: 400 });
    }
    // Every target id, when present, must be a string - anything else
    // used to reach Prisma and surface as a 500.
    for (const value of [postId, commentId, listingId, challengeId, opportunityId, campaignId, userId]) {
      if (value !== undefined && value !== null && typeof value !== "string") {
        return NextResponse.json({ error: "Invalid report target." }, { status: 400 });
      }
    }

    if (!postId && !commentId && !listingId && !challengeId && !opportunityId && !campaignId && !userId) {
      return NextResponse.json(
        {
          error:
            "One of postId, commentId, listingId, challengeId, opportunityId, campaignId, or userId is required",
        },
        { status: 400 }
      );
    }

    // A bare profile report can't target yourself.
    if (userId && userId === session.user.id) {
      return NextResponse.json({ error: "You can't report your own account." }, { status: 400 });
    }

    // ─── Prevent duplicate reports ────────────────────────────────────
    // Previously there was no check here at all - the same person could
    // submit the same report on the same post/comment an unlimited
    // number of times, inflating report counts and spamming moderators
    // with duplicates of something they've already reviewed once.
    // Scoped to "pending" specifically, so a genuinely new report is
    // still allowed once a prior one has actually been reviewed - e.g.
    // if the same post starts misbehaving again after being cleared.
    const target = postId
      ? { postId }
      : commentId
        ? { commentId }
        : listingId
          ? { listingId }
          : challengeId
            ? { challengeId }
            : opportunityId
              ? { opportunityId }
              : campaignId
                ? { campaignId }
                : { reportedUserId: userId };

    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: session.user.id,
        status: "pending",
        ...target,
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
        listingId: listingId || null,
        challengeId: challengeId || null,
        opportunityId: opportunityId || null,
        campaignId: campaignId || null,
        reportedUserId: userId || null,
        reason,
        details: details || null,
        status: "pending",
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    // Foreign-key violation: the reported post/comment/user/etc. doesn't
    // exist (or was deleted meanwhile).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "The reported content no longer exists." }, { status: 404 });
    }
    console.error("Report error:", error);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
