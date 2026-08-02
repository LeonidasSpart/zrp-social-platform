import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── Accept JSON payload with avatarUrl ──────────────────────────
    const { avatarUrl } = await req.json();

    if (!avatarUrl) {
      return NextResponse.json({ error: "Missing avatarUrl" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl },
    });

    return NextResponse.json({ avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error("Avatar update error:", error);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
