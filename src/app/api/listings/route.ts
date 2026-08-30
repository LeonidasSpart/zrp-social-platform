export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { checkImagesPerListing, checkActiveListingsCount, getUserPlan } from "@/lib/limits";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { Prisma } from "@prisma/client";

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
  isPrivate: true,
} as const;

// ─── GET: public browse - only ACTIVE, non-expired listings ─────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const category = req.nextUrl.searchParams.get("category");
    const search = req.nextUrl.searchParams.get("search");
    const location = req.nextUrl.searchParams.get("location");
    const minPrice = req.nextUrl.searchParams.get("minPrice");
    const maxPrice = req.nextUrl.searchParams.get("maxPrice");
    const sort = req.nextUrl.searchParams.get("sort") || "newest";

    const where: Prisma.ListingWhereInput = {
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      where.category = category as (typeof CATEGORIES)[number];
    }
    if (search && search.trim()) {
      where.AND = [
        {
          OR: [
            { title: { contains: search.trim(), mode: "insensitive" } },
            { description: { contains: search.trim(), mode: "insensitive" } },
          ],
        },
      ];
    }
    if (location && location.trim()) {
      where.location = { contains: location.trim(), mode: "insensitive" };
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice && Number.isFinite(Number(minPrice))) {
        (where.price as Prisma.DecimalFilter).gte = Number(minPrice);
      }
      if (maxPrice && Number.isFinite(Number(maxPrice))) {
        (where.price as Prisma.DecimalFilter).lte = Number(maxPrice);
      }
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput =
      sort === "priceLow"
        ? { price: "asc" }
        : sort === "priceHigh"
          ? { price: "desc" }
          : { createdAt: "desc" };

    const listings = await prisma.listing.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        category: true,
        title: true,
        price: true,
        currency: true,
        priceOnRequest: true,
        location: true,
        imageUrls: true,
        videoUrl: true,
        views: true,
        createdAt: true,
        seller: { select: SELLER_SELECT },
        _count: { select: { favorites: true } },
      },
    });

    const { items, nextCursor } = buildPage(listings, limit);
    return jsonWithDecimals({ listings: items, nextCursor });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}

// ─── POST: create a new listing - always starts PENDING_REVIEW ──────
export async function POST(req: NextRequest) {
  // Listing creation is low-frequency, deliberate activity (unlike
  // likes/comments) but not free of abuse risk (spam/scam listing
  // farms) - generous enough for a real seller managing several
  // listings, tight enough to block automated flooding.
  const limit = await rateLimit(req, { limit: 10, window: 3600, type: "listing-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "A valid category is required." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 150) {
      return NextResponse.json(
        { error: "Title is required (max 150 characters)." },
        { status: 400 }
      );
    }
    if (!description || typeof description !== "string" || !description.trim() || description.trim().length > 5000) {
      return NextResponse.json(
        { error: "Description is required (max 5000 characters)." },
        { status: 400 }
      );
    }

    const wantsPriceOnRequest = priceOnRequest === true;
    let numericPrice: number | null = null;
    if (!wantsPriceOnRequest) {
      numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        return NextResponse.json(
          { error: "Provide a valid price, or mark this listing as Price on Request." },
          { status: 400 }
        );
      }
    }

    const cleanImageUrls: string[] = Array.isArray(imageUrls)
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

    const activeCount = await prisma.listing.count({
      where: {
        sellerId: token.id as string,
        status: { in: ["PENDING_REVIEW", "ACTIVE"] },
      },
    });
    const activeCheck = checkActiveListingsCount(activeCount, plan);
    if (!activeCheck.allowed) {
      return NextResponse.json({ error: activeCheck.message }, { status: 400 });
    }

    const listing = await prisma.listing.create({
      data: {
        sellerId: token.id as string,
        category,
        title: title.trim(),
        description: description.trim(),
        price: wantsPriceOnRequest ? null : numericPrice,
        currency: typeof currency === "string" && currency.length === 3 ? currency.toUpperCase() : "USD",
        priceOnRequest: wantsPriceOnRequest,
        location: typeof location === "string" && location.trim() ? location.trim() : null,
        imageUrls: cleanImageUrls,
        videoUrl: typeof videoUrl === "string" && videoUrl ? videoUrl : null,
        // Every listing goes through moderator approval before it's
        // visible to anyone but the seller - same policy as AdCampaign.
        status: "PENDING_REVIEW",
      },
    });

    return jsonWithDecimals({ listing }, { status: 201 });
  } catch (error) {
    console.error("Error creating listing:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }
}
