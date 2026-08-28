import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Prevent brute-forcing the verification token by request volume.
  const limit = await rateLimit(req, { limit: 20, window: 600, type: "auth-verify-email" });
  if (!limit.success) return limit.response;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashToken(token),
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (!user.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (!user.pendingEmail) {
      return NextResponse.json({ error: "No pending email change" }, { status: 400 });
    }

    const newEmail = user.pendingEmail;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        pendingEmail: null,
        verificationToken: null,
        verificationTokenExpiry: null,
        emailVerified: new Date(),
      },
    });

    const redirectUrl = new URL("/settings", process.env.NEXTAUTH_URL);
    redirectUrl.searchParams.set("emailUpdated", "true");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
