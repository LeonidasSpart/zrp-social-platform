import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { COMMUNITY_CATEGORIES, normalizeHashtag, slugifyName } from "@/lib/communities";

// ─── GET (browse) ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { cursor, limit } = parseCursorParams(req);
    const category = req.nextUrl.searchParams.get("category");
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const mine = req.nextUrl.searchParams.get("mine") === "true";

    if (mine && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communities = await prisma.community.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ memberCount: "desc" }, { createdAt: "desc" }],
      where: {
        ...(category && (COMMUNITY_CATEGORIES as readonly string[]).includes(category)
          ? { category: category as any }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(mine ? { members: { some: { userId } } } : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        hashtag: true,
        iconUrl: true,
        memberCount: true,
        createdAt: true,
        createdBy: { select: { id: true, username: true, name: true } },
        ...(userId
          ? { members: { where: { userId }, select: { role: true } } }
          : {}),
      },
    });

    const { items, nextCursor } = buildPage(communities, limit);
    const result = items.map((c: any) => ({
      ...c,
      isMember: userId ? c.members?.length > 0 : false,
      myRole: userId ? c.members?.[0]?.role ?? null : null,
      members: undefined,
    }));

    return NextResponse.json({ items: result, nextCursor, categories: COMMUNITY_CATEGORIES });
  } catch (error) {
    console.error("Error fetching communities:", error);
    return NextResponse.json({ error: "Failed to fetch communities" }, { status: 500 });
  }
}

// ─── POST (create) ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 10, window: 3600, type: "communities-create" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = typeof body.category === "string" ? body.category : "GENERAL";
    const hashtag = typeof body.hashtag === "string" ? normalizeHashtag(body.hashtag) : null;

    if (name.length < 3 || name.length > 60) {
      return NextResponse.json(
        { error: "Community name must be 3-60 characters." },
        { status: 400 }
      );
    }
    if (description.length < 10 || description.length > 500) {
      return NextResponse.json(
        { error: "Description must be 10-500 characters." },
        { status: 400 }
      );
    }
    if (!(COMMUNITY_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (!hashtag) {
      return NextResponse.json(
        { error: "Hashtag must be 2-32 letters, numbers or underscores." },
        { status: 400 }
      );
    }

    const slug = slugifyName(name);
    const existingSlug = await prisma.community.findUnique({ where: { slug } });
    if (existingSlug) {
      return NextResponse.json(
        { error: "A community with a similar name already exists." },
        { status: 409 }
      );
    }

    const community = await prisma.community.create({
      data: {
        slug,
        name,
        description,
        category: category as any,
        hashtag,
        createdById: session.user.id,
        memberCount: 1,
        members: {
          create: { userId: session.user.id, role: "OWNER" },
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        hashtag: true,
        memberCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ community, isMember: true, myRole: "OWNER" }, { status: 201 });
  } catch (error) {
    console.error("Error creating community:", error);
    return NextResponse.json({ error: "Failed to create community" }, { status: 500 });
  }
}
