export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: a campaign's whitelist applications - creator-only (contains
// applicant contact info, not public like everything else in the
// launchpad) ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const { id } = await params;
    const campaign = await prisma.idoCampaign.findUnique({ where: { id }, select: { creatorId: true } });
    if (!campaign) {
      return NextResponse.json({ error: "IDO campaign not found." }, { status: 404 });
    }
    if (campaign.creatorId !== userId) {
      return NextResponse.json({ error: "Only this campaign's creator can view its applications." }, { status: 403 });
    }

    const applications = await prisma.idoWhitelistApplication.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
    });

    return jsonWithDecimals({ applications });
  } catch (error) {
    console.error("Error fetching IDO whitelist applications:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

// ─── POST: apply for whitelist - wallet-native, no ZRP account needed.
// Records an application only; never moves or custodies funds. ────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 3600, type: "ido-whitelist-apply" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, contactEmail } = body;

    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid walletAddress is required." }, { status: 400 });
    }
    if (contactEmail !== undefined && contactEmail !== null && contactEmail !== "") {
      if (typeof contactEmail !== "string" || contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        return NextResponse.json({ error: "Invalid contact email." }, { status: 400 });
      }
    }

    const campaign = await prisma.idoCampaign.findUnique({ where: { id }, select: { id: true, cancelledAt: true, saleEndsAt: true } });
    if (!campaign) {
      return NextResponse.json({ error: "IDO campaign not found." }, { status: 404 });
    }
    if (campaign.cancelledAt || campaign.saleEndsAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This campaign is no longer accepting whitelist applications." }, { status: 400 });
    }

    try {
      const application = await prisma.idoWhitelistApplication.create({
        data: {
          campaignId: id,
          applicantWalletAddress: walletAddress,
          contactEmail: typeof contactEmail === "string" && contactEmail ? contactEmail : null,
        },
      });
      return jsonWithDecimals({ application }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "This wallet has already applied for this campaign's whitelist." }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    console.error("IDO whitelist application error:", error);
    return NextResponse.json({ error: "Failed to submit application. Please try again." }, { status: 500 });
  }
}
