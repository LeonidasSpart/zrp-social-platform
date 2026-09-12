import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// ─── GET (the current user's own lists) ─────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { cursor, limit } = parseCursorParams(req);
    const lists = await prisma.list.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      where: { ownerId: session.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        isPrivate: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });

    const { items, nextCursor } = buildPage(lists, limit);
    return NextResponse.json({
      items: items.map((l: any) => ({ ...l, memberCount: l._count.members, _count: undefined })),
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching lists:", error);
    return NextResponse.json({ error: "Failed to fetch lists" }, { status: 500 });
  }
}

// ─── POST (create) ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "lists-create" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const isPrivate = body.isPrivate === true;

    if (name.length < 1 || name.length > 60) {
      return NextResponse.json({ error: "List name must be 1-60 characters." }, { status: 400 });
    }
    if (description && description.length > 200) {
      return NextResponse.json({ error: "Description must be under 200 characters." }, { status: 400 });
    }

    const existingCount = await prisma.list.count({ where: { ownerId: session.user.id } });
    if (existingCount >= 50) {
      return NextResponse.json(
        { error: "You've reached the maximum of 50 lists." },
        { status: 400 }
      );
    }

    const list = await prisma.list.create({
      data: { name, description, isPrivate, ownerId: session.user.id },
      select: { id: true, name: true, description: true, isPrivate: true, createdAt: true },
    });

    return NextResponse.json({ list: { ...list, memberCount: 0 } }, { status: 201 });
  } catch (error) {
    console.error("Error creating list:", error);
    return NextResponse.json({ error: "Failed to create list" }, { status: 500 });
  }
}
