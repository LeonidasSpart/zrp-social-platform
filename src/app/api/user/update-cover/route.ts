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

    // ─── Accept JSON payload with coverUrl ──────────────────────────
    const { coverUrl } = await req.json();

    if (!coverUrl) {
      return NextResponse.json({ error: "Missing coverUrl" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { coverUrl },
    });

    return NextResponse.json({ coverUrl: user.coverUrl });
  } catch (error) {
    console.error("Cover update error:", error);
    return NextResponse.json({ error: "Failed to update cover" }, { status: 500 });
  }
}
