import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { canAccessApi } from "@/lib/permissions";
import { apiKeyExpiryFor } from "@/lib/api-auth";
import crypto from "crypto";

// ─── Helper: Generate a secure API key ─────────────────────────────
function generateApiKey(): { plain: string; hash: string } {
  const plain = `zrp_${crypto.randomBytes(24).toString("hex")}`; // 48 chars hex + prefix
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

// Unbounded key issuance was an open door to silently accumulating
// long-lived credentials - cap how many a single account can hold at
// once (revoked keys don't count against this).
const MAX_ACTIVE_KEYS_PER_USER = 10;

// ─── GET: List all API keys for the user ──────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    // Check if user has API access (Business/Enterprise)
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

    const keys = await prisma.apiKey.findMany({
      where: { userId, revoked: false },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
        revoked: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("API keys GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST: Generate a new API key ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

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

    const body = await req.json();
    const { name, expiresInDays } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    const activeKeyCount = await prisma.apiKey.count({
      where: { userId, revoked: false },
    });
    if (activeKeyCount >= MAX_ACTIVE_KEYS_PER_USER) {
      return NextResponse.json(
        { error: `You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active API keys. Revoke one before creating another.` },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: every key gets an expiry. The comment here always said
    // "default: 365 days", but the code only set one when the client
    // asked for it - a request that omitted expiresInDays produced a key
    // that never expired (and validateApiKey accepts a null expiresAt),
    // so the intended default was silently "forever". Now: omitted →
    // DEFAULT_KEY_LIFETIME_DAYS; anything asked for is clamped to
    // [1, MAX_KEY_LIFETIME_DAYS]. Keys that already exist are not
    // touched by this (see api-auth.ts for how existing keys are read).
    const expiresAt = apiKeyExpiryFor(expiresInDays);

    const { plain, hash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        keyHash: hash,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Return the plain key (only once!)
    return NextResponse.json({
      key: apiKey,
      plainKey: plain, // <-- this is the actual token
      warning: "Store this key securely. It will not be shown again.",
    });
  } catch (error) {
    console.error("API keys POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
