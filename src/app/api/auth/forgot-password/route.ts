import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email"; // ← ADD THIS
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // ─── Find user ──────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });

    // Security: always return a generic message
    if (!user) {
      return NextResponse.json({
        message: "If an account exists, you'll receive a reset link",
      });
    }

    // ─── Generate token ─────────────────────────────────────────────
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // ─── Send email ──────────────────────────────────────────────────
    const resetLink = `${process.env.NEXTAUTH_URL}/reset-password/${resetToken}`;
    await sendPasswordResetEmail(user.email, user.name || undefined, resetLink);

    return NextResponse.json({
      message: "If an account exists, you'll receive a reset link",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
