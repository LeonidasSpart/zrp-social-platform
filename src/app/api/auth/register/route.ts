import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, username, email, password } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return NextResponse.json({ error: "Email or username taken" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        name,
        username,
        email,
        password: hashed,
        verificationToken: token,
        verificationTokenExpiry: expiry,
      },
    });

    // Send email (don't await to avoid blocking response)
    sendVerificationEmail(email, token).catch(console.error);

    return NextResponse.json(
      { message: "User created. Please check your email to verify your account." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
