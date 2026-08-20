import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { canUseCustomUrl } from "@/lib/permissions";

// ─── PATCH: Update custom URL ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get full user with plan
    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: {
        id: true,
        plan: true,
        username: true,
        customUrl: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Check if user has permission ────────────────────────────
    if (!canUseCustomUrl(user)) {
      return NextResponse.json(
        { error: "Custom profile URLs require a Pro, Business, or Enterprise plan." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { customUrl } = body;

    // ─── Validate input ───────────────────────────────────────────
    if (!customUrl) {
      return NextResponse.json(
        { error: "Custom URL is required." },
        { status: 400 }
      );
    }

    // Sanitize: only alphanumeric, underscore, hyphen
    const sanitized = customUrl.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (sanitized.length < 3) {
      return NextResponse.json(
        { error: "Custom URL must be at least 3 characters." },
        { status: 400 }
      );
    }
    if (sanitized.length > 30) {
      return NextResponse.json(
        { error: "Custom URL must be less than 30 characters." },
        { status: 400 }
      );
    }

    // ─── Check if already taken ───────────────────────────────────
    const existing = await prisma.user.findFirst({
      where: {
        customUrl: sanitized,
        NOT: { id: user.id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This custom URL is already taken." },
        { status: 409 }
      );
    }

    // ─── Update user ──────────────────────────────────────────────
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { customUrl: sanitized },
      select: {
        id: true,
        username: true,
        customUrl: true,
        plan: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      profileUrl: `${process.env.NEXTAUTH_URL}/@${sanitized}`,
    });
  } catch (error) {
    console.error("Custom URL update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove custom URL (revert to username) ──────────────
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { id: true, plan: true, username: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!canUseCustomUrl(user)) {
      return NextResponse.json(
        { error: "Custom profile URLs require a Pro, Business, or Enterprise plan." },
        { status: 403 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { customUrl: null },
    });

    return NextResponse.json({
      success: true,
      message: "Custom URL removed. Your profile is now at /" + user.username,
    });
  } catch (error) {
    console.error("Custom URL delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
