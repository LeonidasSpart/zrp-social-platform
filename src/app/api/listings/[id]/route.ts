export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { checkImagesPerListing, getUserPlan } from "@/lib/limits";
import { isSessionAdmin } from "@/lib/admin";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

const CATEGORIES = [
  "LUXURY_CARS",
  "YACHTS_BOATS",
  "PRIVATE_AIRCRAFT",
  "LUXURY_HOTELS_RESORTS",
  "LUXURY_REAL_ESTATE",
  "WATCHES_JEWELRY",
  "OTHER_LUXURY",
] as const;

const SELLER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
  bio: true,
  createdAt: true,
} as const;

// ─── GET: listing detail. Public only sees ACTIVE listings; the ─────
// seller (and staff) can always see their own regardless of status.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        seller: { select: SELLER_SELECT },
        _count: { select: { favorites: true } },
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const isOwner = session?.user?.id === listing.sellerId;
    const isStaff = isOwner ? false : await isSessionAdmin(session);

    if (listing.status !== "ACTIVE" && !isOwner && !isStaff) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Best-effort view counter - only for genuinely public views, and
    // never blocks the response if it fails.
    if (listing.status === "ACTIVE" && !isOwner) {
      prisma.listing
        .update({ where: { id }, data: { views: { increment: 1 } } })
        .catch((err) => console.error("Listing view-count increment failed:", err));
    }

    let favorited = false;
    if (session?.user?.id) {
      const fav = await prisma.listingFavorite.findUnique({
        where: { userId_listingId: { userId: session.user.id, listingId: id } },
      });
      favorited = !!fav;
    }

    return jsonWithDecimals({ ...listing, favorited });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}

// ─── PUT: seller edits their own listing ─────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (existing.sellerId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (existing.status === "SOLD" || existing.status === "REMOVED") {
      return NextResponse.json(
        { error: "This listing can no longer be edited." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      category,
      title,
      description,
      price,
      currency,
      priceOnRequest,
      location,
      imageUrls,
      videoUrl,
    } = body;

    if (category !== undefined && !(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (title !== undefined && (!title.trim() || title.trim().length > 150)) {
      return NextResponse.json({ error: "Title is required (max 150 characters)." }, { status: 400 });
    }
    if (description !== undefined && (!description.trim() || description.trim().length > 5000)) {
      return NextResponse.json(
        { error: "Description is required (max 5000 characters)." },
        { status: 400 }
      );
    }

    const wantsPriceOnRequest = priceOnRequest === true;
    let numericPrice: number | null | undefined = undefined;
    if (priceOnRequest !== undefined || price !== undefined) {
      if (wantsPriceOnRequest) {
        numericPrice = null;
      } else {
        numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
          return NextResponse.json(
            { error: "Provide a valid price, or mark this listing as Price on Request." },
            { status: 400 }
          );
        }
      }
    }

    let cleanImageUrls: string[] | undefined;
    if (imageUrls !== undefined) {
      cleanImageUrls = Array.isArray(imageUrls)
        ? imageUrls.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 30)
        : [];
      if (cleanImageUrls.length === 0) {
        return NextResponse.json({ error: "At least one photo is required." }, { status: 400 });
      }
      const plan = getUserPlan({ plan: token.plan as string | undefined });
      const imagesCheck = checkImagesPerListing(cleanImageUrls.length, plan);
      if (!imagesCheck.allowed) {
        return NextResponse.json({ error: imagesCheck.message }, { status: 400 });
      }
    }

    // Any substantive edit to a live listing sends it back through
    // moderation - otherwise an approved listing could be swapped for
    // something completely different (bait-and-switch) without ever
    // being re-reviewed. Edits to a listing still pending/rejected
    // just update in place.
    const substantiveChange =
      title !== undefined ||
      description !== undefined ||
      category !== undefined ||
      numericPrice !== undefined ||
      cleanImageUrls !== undefined ||
      videoUrl !== undefined;

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        ...(category !== undefined ? { category } : {}),
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(numericPrice !== undefined ? { price: numericPrice, priceOnRequest: wantsPriceOnRequest } : {}),
        ...(currency !== undefined && typeof currency === "string" && currency.length === 3
          ? { currency: currency.toUpperCase() }
          : {}),
        ...(location !== undefined ? { location: location?.trim() || null } : {}),
        ...(cleanImageUrls !== undefined ? { imageUrls: cleanImageUrls } : {}),
        ...(videoUrl !== undefined ? { videoUrl: videoUrl || null } : {}),
        ...(existing.status === "ACTIVE" && substantiveChange
          ? { status: "PENDING_REVIEW", rejectionReason: null, reviewedBy: null, reviewedAt: null }
          : {}),
      },
    });

    return jsonWithDecimals({ listing: updated });
  } catch (error) {
    console.error("Error updating listing:", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}

// ─── DELETE: seller removes their own listing, or staff removes any ──
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.listing.findUnique({
      where: { id },
      select: { sellerId: true, imageUrls: true, videoUrl: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const isOwner = existing.sellerId === session.user.id;
    if (!isOwner && !(await isSessionAdmin(session))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.listing.delete({ where: { id } });

    await deleteUploadThingFiles([...existing.imageUrls, existing.videoUrl]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting listing:", error);
    return NextResponse.json({ error: "Failed to delete listing" }, { status: 500 });
  }
}
