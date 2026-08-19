import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { canAccessApi } from "@/lib/permissions";

// ─── DELETE: Revoke an API key ────────────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const keyId = params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user || !canAccessApi(user)) {
      return NextResponse.json(
        { error: "API access requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    // Verify the key belongs to this user
    const existing = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
        revoked: false,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "API key not found or already revoked." },
        { status: 404 }
      );
    }

    // Soft delete: set revoked = true
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revoked: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API key DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
