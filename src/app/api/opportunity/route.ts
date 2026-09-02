export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { OPPORTUNITY_TYPES, type OpportunityType } from "@/lib/opportunity";
import { Prisma } from "@prisma/client";

const POSTER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: browse active opportunities ────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const type = req.nextUrl.searchParams.get("type");
    const remote = req.nextUrl.searchParams.get("remote");
    const search = req.nextUrl.searchParams.get("q");
    const now = new Date();

    const where: Prisma.OpportunityListingWhereInput = {
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    if (type && (OPPORTUNITY_TYPES as readonly string[]).includes(type)) {
      where.type = type as OpportunityType;
    }
    if (remote === "true") where.remote = true;
    if (search && search.trim()) {
      where.AND = [
        {
          OR: [
            { title: { contains: search.trim(), mode: "insensitive" } },
            { description: { contains: search.trim(), mode: "insensitive" } },
            { skills: { has: search.trim().toLowerCase() } },
          ],
        },
      ];
    }

    const listings = await prisma.opportunityListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        organizationName: true,
        skills: true,
        location: true,
        remote: true,
        isPaid: true,
        compensationInfo: true,
        externalUrl: true,
        deadline: true,
        views: true,
        createdAt: true,
        poster: { select: POSTER_SELECT },
        _count: { select: { applications: true } },
      },
    });

    const { items, nextCursor } = buildPage(listings, limit);
    return NextResponse.json({ listings: items, nextCursor });
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}

// ─── POST: create an opportunity listing - PENDING_REVIEW gate ──────
// Same policy as Listing (ZRP Market Plus): live only after staff
// approval, since a fake job/scholarship posting is a real harm
// vector, not low-risk content like a Post.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 10, window: 3600, type: "opportunity-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      type,
      title,
      description,
      organizationName,
      skills,
      location,
      remote,
      isPaid,
      compensationInfo,
      externalUrl,
      deadline,
    } = body;

    if (!type || !(OPPORTUNITY_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "A valid opportunity type is required." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 150) {
      return NextResponse.json({ error: "Title is required (max 150 characters)." }, { status: 400 });
    }
    if (!description || typeof description !== "string" || !description.trim() || description.trim().length > 8000) {
      return NextResponse.json({ error: "Description is required (max 8000 characters)." }, { status: 400 });
    }

    const cleanSkills = Array.isArray(skills)
      ? skills
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim().toLowerCase().slice(0, 40))
          .slice(0, 20)
      : [];

    if (externalUrl && typeof externalUrl === "string") {
      try {
        const parsed = new URL(externalUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return NextResponse.json({ error: "External application URL must be http(s)." }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "External application URL is invalid." }, { status: 400 });
      }
    }

    let cleanDeadline: Date | null = null;
    if (deadline) {
      const d = new Date(deadline);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid deadline." }, { status: 400 });
      }
      cleanDeadline = d;
    }

    const listing = await prisma.opportunityListing.create({
      data: {
        posterId: token.id as string,
        type: type as OpportunityType,
        title: title.trim(),
        description: description.trim(),
        organizationName: typeof organizationName === "string" ? organizationName.trim().slice(0, 150) || null : null,
        skills: cleanSkills,
        location: typeof location === "string" ? location.trim().slice(0, 150) || null : null,
        remote: Boolean(remote),
        isPaid: isPaid === undefined ? true : Boolean(isPaid),
        compensationInfo: typeof compensationInfo === "string" ? compensationInfo.trim().slice(0, 200) || null : null,
        externalUrl: typeof externalUrl === "string" ? externalUrl.trim().slice(0, 500) || null : null,
        deadline: cleanDeadline,
        status: "PENDING_REVIEW",
      },
    });

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error("Error creating opportunity listing:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }
}
