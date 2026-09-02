export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

// ─── POST: bookmark a listing ────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: listingId } = await params;

  try {
    const listing = await prisma.opportunityListing.findUnique({ where: { id: listingId }, select: { id: true } });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    await prisma.opportunitySavedListing.upsert({
      where: { userId_listingId: { userId: token.id as string, listingId } },
      update: {},
      create: { userId: token.id as string, listingId },
    });

    return NextResponse.json({ success: true, saved: true });
  } catch (error) {
    console.error("Error saving opportunity listing:", error);
    return NextResponse.json({ error: "Failed to save listing" }, { status: 500 });
  }
}

// ─── DELETE: remove bookmark ─────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: listingId } = await params;

  try {
    await prisma.opportunitySavedListing.deleteMany({
      where: { userId: token.id as string, listingId },
    });
    return NextResponse.json({ success: true, saved: false });
  } catch (error) {
    console.error("Error removing saved opportunity listing:", error);
    return NextResponse.json({ error: "Failed to remove saved listing" }, { status: 500 });
  }
}
