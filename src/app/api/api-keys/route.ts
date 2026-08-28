import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { canAccessApi } from "@/lib/permissions";
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

    // Optional expiration (default: 365 days)
    let expiresAt: Date | undefined;
    if (expiresInDays && typeof expiresInDays === "number" && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

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
