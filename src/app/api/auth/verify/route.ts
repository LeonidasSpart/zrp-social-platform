import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Prevent brute-forcing the verification token by request volume.
  const limit = await rateLimit(req, { limit: 20, window: 600, type: "auth-verify" });
  if (!limit.success) return limit.response;

  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashToken(token),
        verificationTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
  }
}
