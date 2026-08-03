import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const defaultPreferences = {
  likes: true,
  comments: true,
  follows: true,
  reposts: true,
  mentions: true,
  messages: true,
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailPreferences: true },
    });
    const preferences = user?.emailPreferences || defaultPreferences;
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("GET email-preferences error:", error);
    return NextResponse.json(defaultPreferences);
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const allowedKeys = Object.keys(defaultPreferences);
    const invalidKeys = Object.keys(body).filter(k => !allowedKeys.includes(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Invalid keys: ${invalidKeys.join(", ")}` },
        { status: 400 }
      );
    }

    // ─── Fetch current preferences from DB ──────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailPreferences: true },
    });

    // Cast to Record<string, boolean> to avoid TypeScript spread error
    const currentPreferences = (user?.emailPreferences as Record<string, boolean>) || defaultPreferences;

    // ─── Merge: only update the keys provided in the request ──────
    const newPreferences = { ...currentPreferences, ...body };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { emailPreferences: newPreferences },
    });

    return NextResponse.json({ success: true, preferences: newPreferences });
  } catch (error) {
    console.error("PUT email-preferences error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
