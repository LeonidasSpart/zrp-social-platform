export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { canTransition } from "@/lib/ads/lifecycle";

// ─── GET: full details + stats for one campaign (owner only) ────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      // adminNote is staff-only (see schema.prisma) - never returned to
      // the advertiser.
      omit: { adminNote: true },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            imageUrls: true,
            mediaType: true,
          },
        },
        _count: { select: { impressions: true, clicks: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error fetching ad campaign:", error);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

// ─── PUT: pause/resume, or edit budget/dates (owner only) ───────────
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: { advertiserId: true, status: true, budgetSpent: true, budgetTotal: true, paidAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { status, budgetTotal, endDate } = body;
    const data: any = {};

    // Advertisers can only ever pause/resume/cancel their own campaign,
    // never set it directly to ACTIVE from anywhere but PAUSED, and never
    // set REJECTED/PAYMENT_PENDING/COMPLETED themselves - those are
    // granted by moderator approval, the payment route, or automatic
    // budget/date exhaustion respectively. The lifecycle map in
    // @/lib/ads/lifecycle is the single source of truth for which of
    // these moves is legal from the campaign's current status - this
    // route never re-derives that logic inline.
    if (status !== undefined) {
      if (status !== "PAUSED" && status !== "ACTIVE" && status !== "CANCELLED") {
        return NextResponse.json(
          { error: "status must be PAUSED, ACTIVE, or CANCELLED." },
          { status: 400 }
        );
      }
      if (!canTransition("advertiser", existing.status, status)) {
        return NextResponse.json(
          { error: `Cannot set status to ${status} from ${existing.status}.` },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (budgetTotal !== undefined) {
      const numericBudget = Number(budgetTotal);
      if (!Number.isFinite(numericBudget) || numericBudget < existing.budgetSpent.toNumber()) {
        return NextResponse.json(
          { error: "New budget can't be less than what's already been spent." },
          { status: 400 }
        );
      }
      // ⚠️ SECURITY: once paid, budgetTotal is what the on-chain payment
      // actually funded (the pay route requires verifiedAmount >=
      // budgetTotal). Raising it afterwards would let serve/impression/
      // click keep billing - and showing - the ad far past what was ever
      // paid for: free advertising. Lowering it is still allowed.
      if (existing.paidAt && existing.budgetTotal.lessThan(numericBudget)) {
        return NextResponse.json(
          { error: "A funded campaign's budget can't be increased." },
          { status: 400 }
        );
      }
      data.budgetTotal = numericBudget;
    }

    if (endDate !== undefined) {
      const parsedEnd = endDate ? new Date(endDate) : null;
      if (parsedEnd && Number.isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
      }
      data.endDate = parsedEnd;
    }

    // Compare-and-swap on the status the transition above was validated
    // against: a staff suspend/cancel (or the payment route) landing in
    // between must not be silently overwritten - e.g. an advertiser's
    // PAUSED -> ACTIVE racing a staff PAUSED -> SUSPENDED would otherwise
    // resume a suspended campaign.
    const updated = await prisma.adCampaign.updateMany({
      where: { id: params.id, status: existing.status },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "This campaign was changed in the meantime. Please refresh and try again." },
        { status: 409 }
      );
    }
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      omit: { adminNote: true },
    });

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error updating ad campaign:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

// ─── DELETE: remove a campaign (owner only) ──────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: { advertiserId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Deleting the campaign cascades to its impressions/clicks (schema
    // onDelete: Cascade) but never touches the underlying post itself -
    // the ad creative is a real post the advertiser still owns.
    await prisma.adCampaign.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ad campaign:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
