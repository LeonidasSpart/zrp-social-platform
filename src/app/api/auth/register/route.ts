import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, username, email, password } = await req.json();

    // ─── Validation ──────────────────────────────────────────────
    if (!email || !password || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return NextResponse.json({ error: "Username must be 3-20 characters" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return NextResponse.json(
        { error: "Username can only contain letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    // ─── Check existing user (specific error per field) ────────────
    const existingEmail = await prisma.user.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered", field: "email" }, { status: 400 });
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username: { equals: trimmedUsername, mode: "insensitive" } },
    });
    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken", field: "username" }, { status: 400 });
    }

    // ─── Hash password & generate token ────────────────────────
    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // ─── Create user (explicitly set role) ─────────────────────
    const user = await prisma.user.create({
      data: {
        name: name || null,
        username: trimmedUsername,
        email,
        password: hashed,
        role: "USER", // ✅ explicit default
        verificationToken: token,
        verificationTokenExpiry: expiry,
      },
    });

    // ─── Send verification email (non‑blocking) ────────────────
    sendVerificationEmail(email, token).catch((err) => {
      console.error("Email sending failed:", err);
    });

    return NextResponse.json(
      { message: "User created. Please check your email to verify your account." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    // Log the full error for debugging
    return NextResponse.json(
      { error: "Registration failed. Please try again later." },
      { status: 500 }
    );
  }
}
