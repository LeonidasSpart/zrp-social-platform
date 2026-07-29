import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      // Don't reveal that the user doesn't exist for security
      return NextResponse.json({
        message: "If an account exists, you'll receive a reset link",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        // Add these fields to your schema if they don't exist
        // resetToken: resetToken,
        // resetTokenExpiry: resetTokenExpiry,
      },
    });

    // In production, send email with reset link
    const resetLink = `${process.env.NEXTAUTH_URL}/reset-password/${resetToken}`;
    console.log(`🔐 Reset link: ${resetLink}`);

    return NextResponse.json({
      message: "If an account exists, you'll receive a reset link",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
