import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        deletionRequestedAt: true,
        deletionScheduledFor: true,
      },
    });

    return NextResponse.json({
      requestedAt: user?.deletionRequestedAt,
      scheduledFor: user?.deletionScheduledFor,
    });
  } catch (error) {
    console.error("Deletion status error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
