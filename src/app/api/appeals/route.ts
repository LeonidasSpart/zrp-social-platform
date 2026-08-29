import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [eligibleReports, appeals] = await Promise.all([
      prisma.report.findMany({
        where: {
          targetUserId: session.user.id,
          status: "actioned",
          appeals: { none: { userId: session.user.id } },
        },
        orderBy: { actionedAt: "desc" },
        select: {
          id: true,
          reason: true,
          actionType: true,
          actionNote: true,
          actionedAt: true,
        },
      }),
      prisma.appeal.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          message: true,
          status: true,
          resolutionNote: true,
          resolvedAt: true,
          createdAt: true,
          report: {
            select: { id: true, reason: true, actionType: true },
          },
        },
      }),
    ]);

    return NextResponse.json({ eligibleReports, appeals });
  } catch (error) {
    console.error("Error fetching appeals:", error);
    return NextResponse.json({ error: "Failed to fetch appeals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Appeals are meant to be rare and deliberate, same rationale as the
  // report-creation limit this mirrors.
  const limit = await rateLimit(req, { limit: 10, window: 600, type: "appeal-create" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { reportId, message } = await req.json();

    if (!reportId || typeof reportId !== "string") {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedMessage || trimmedMessage.length > 2000) {
      return NextResponse.json(
        { error: "Please provide an appeal message (up to 2000 characters)." },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, status: true, targetUserId: true },
    });

    if (!report || report.status !== "actioned" || report.targetUserId !== session.user.id) {
      return NextResponse.json(
        { error: "This report isn't eligible for an appeal." },
        { status: 404 }
      );
    }

    const existing = await prisma.appeal.findUnique({
      where: { reportId_userId: { reportId, userId: session.user.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You've already filed an appeal for this action." },
        { status: 409 }
      );
    }

    const appeal = await prisma.appeal.create({
      data: {
        reportId,
        userId: session.user.id,
        message: trimmedMessage,
      },
    });

    return NextResponse.json(appeal, { status: 201 });
  } catch (error) {
    console.error("Error creating appeal:", error);
    return NextResponse.json({ error: "Failed to submit appeal" }, { status: 500 });
  }
}
