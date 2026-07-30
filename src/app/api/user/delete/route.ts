import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── Request account deletion ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If already scheduled for deletion, cancel it
    if (user.deletionScheduledFor) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          deletionScheduledFor: null,
          deletionRequestedAt: null,
        },
      });
      return NextResponse.json({ message: "Deletion cancelled." });
    }

    // Schedule deletion in 30 days
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        deletionRequestedAt: new Date(),
        deletionScheduledFor: deletionDate,
      },
    });

    return NextResponse.json({
      message: "Account scheduled for deletion in 30 days.",
      deletionDate,
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Failed to schedule deletion" }, { status: 500 });
  }
}
