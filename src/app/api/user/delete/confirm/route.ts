import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

    // Delete user and all associated data (cascade handles it)
    await prisma.user.delete({
      where: { id: session.user.id },
    });

    // Clear session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" });

    return response;
  } catch (error) {
    console.error("Confirm deletion error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
