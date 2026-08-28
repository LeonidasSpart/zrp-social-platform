import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  // This endpoint is unauthenticated by necessity (a user who can't log
  // in yet still needs to be able to request a new verification email),
  // which is exactly why it needs a strict limit - without one, it's an
  // open email-bombing vector against any address, since it accepts
  // whatever email is put in the request body and always sends real mail.
  const limit = await rateLimit(req, { limit: 3, window: 600, type: "resend-verification" });
  if (!limit.success) return limit.response;

  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email already verified" }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashToken(token),
        verificationTokenExpiry: expiry,
      },
    });

    await sendVerificationEmail(email, token);

    return NextResponse.json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Failed to resend verification" }, { status: 500 });
  }
}
