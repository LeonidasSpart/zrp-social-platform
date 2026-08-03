import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── GET: Check current username and cooldown ──────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, usernameChangedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let cooldownDays = 0;
    if (user.usernameChangedAt) {
      const daysSince = (Date.now() - user.usernameChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      cooldownDays = Math.max(0, 30 - Math.floor(daysSince));
    }

    return NextResponse.json({
      username: user.username,
      cooldownDays,
    });
  } catch (error) {
    console.error("Error fetching username info:", error);
    return NextResponse.json(
      { error: "Failed to fetch username info" },
      { status: 500 }
    );
  }
}

// ─── PUT: Update username ──────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { username } = await req.json();

    // ─── Validation ──────────────────────────────────────────────────
    if (!username || username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }
    if (username.length > 20) {
      return NextResponse.json(
        { error: "Username must be at most 20 characters" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username can only contain letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    // ─── Get current user data ──────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, usernameChangedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (username === user.username) {
      return NextResponse.json(
        { error: "New username is the same as current" },
        { status: 400 }
      );
    }

    // ─── Cooldown check (30 days) ──────────────────────────────────
    if (user.usernameChangedAt) {
      const daysSince = (Date.now() - user.usernameChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        const daysLeft = Math.ceil(30 - daysSince);
        return NextResponse.json(
          { error: `You can change your username again in ${daysLeft} days` },
          { status: 400 }
        );
      }
    }

    // ─── Check if username is taken (case‑insensitive) ─────────────
    const existing = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
        NOT: { id: session.user.id },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // ─── Update username ─────────────────────────────────────────────
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username,
        usernameChangedAt: new Date(),
      },
    });

    // ─── Return updated user (exclude password) ────────────────────
    const { password, ...userWithoutPassword } = updatedUser;
    return NextResponse.json({ user: userWithoutPassword });
  } catch (error) {
    console.error("Username update error:", error);
    return NextResponse.json(
      { error: "Failed to update username" },
      { status: 500 }
    );
  }
}
