import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── POST /api/users/mute: Toggle mute ──────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId: mutedUserId } = await req.json();
  if (!mutedUserId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  if (mutedUserId === session.user.id) {
    return NextResponse.json({ error: "You cannot mute yourself" }, { status: 400 });
  }

  try {
    // Check if already muted
    const existing = await prisma.mute.findUnique({
      where: {
        muterId_mutedId: {
          muterId: session.user.id,
          mutedId: mutedUserId,
        },
      },
    });

    if (existing) {
      // Unmute
      await prisma.mute.delete({
        where: {
          muterId_mutedId: {
            muterId: session.user.id,
            mutedId: mutedUserId,
          },
        },
      });
      return NextResponse.json({ muted: false });
    } else {
      // Mute
      await prisma.mute.create({
        data: {
          muterId: session.user.id,
          mutedId: mutedUserId,
        },
      });
      return NextResponse.json({ muted: true });
    }
  } catch (error) {
    console.error("Mute toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle mute" }, { status: 500 });
  }
}

// ─── GET /api/users/mute?userId=xxx: Check mute status ──────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  try {
    const mute = await prisma.mute.findUnique({
      where: {
        muterId_mutedId: {
          muterId: session.user.id,
          mutedId: userId,
        },
      },
    });
    return NextResponse.json({ muted: !!mute });
  } catch (error) {
    console.error("Mute status error:", error);
    return NextResponse.json({ error: "Failed to check mute status" }, { status: 500 });
  }
}
