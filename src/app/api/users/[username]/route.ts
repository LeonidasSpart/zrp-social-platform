import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { username } = await req.json();

    if (!username || username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
    }

    if (username.length > 20) {
      return NextResponse.json({ error: "Username must be less than 20 characters" }, { status: 400 });
    }

    // Check if username is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        username: username.toLowerCase(),
        NOT: { id: session.user.id },
      },
    });

    if (existingUser) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 400 });
    }

    // Check cooldown (30 days)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { usernameChangedAt: true },
    });

    if (currentUser?.usernameChangedAt) {
      const daysSince = Math.floor(
        (Date.now() - currentUser.usernameChangedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince < 30) {
        return NextResponse.json(
          { error: `You can change your username again in ${30 - daysSince} days` },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username: username.toLowerCase(),
        usernameChangedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "Username updated successfully",
      user: { id: user.id, username: user.username },
    });
  } catch (error) {
    console.error("Username update error:", error);
    return NextResponse.json({ error: "Failed to update username" }, { status: 500 });
  }
}
