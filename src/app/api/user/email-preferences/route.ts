import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── Default preferences (all true) ──────────────────────────────
const defaultPreferences = {
  mentions: true,
  messages: true,
  likes: true,
  comments: true,
  follows: true,
  reposts: true,
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
    console.error("Error fetching email preferences:", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    // Validate body: it must be an object with only allowed keys
    const allowedKeys = Object.keys(defaultPreferences);
    const invalidKeys = Object.keys(body).filter(k => !allowedKeys.includes(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Invalid keys: ${invalidKeys.join(", ")}` },
        { status: 400 }
      );
    }

    // Merge with defaults to ensure all keys exist
    const newPreferences = { ...defaultPreferences, ...body };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { emailPreferences: newPreferences },
    });

    return NextResponse.json({ success: true, preferences: newPreferences });
  } catch (error) {
    console.error("Error updating email preferences:", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
