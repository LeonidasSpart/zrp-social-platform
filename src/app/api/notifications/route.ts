import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// GET all notifications for current user
//
// ⚠️ CONTRACT: the response body is, and must stay, a bare JSON array -
// both the web client (`Array.isArray(data)`) and the iOS app
// (`JSONDecoder` decoding `[AppNotification]` directly, see
// ios-native/ZRPSocial/Models/AppNotification.swift) depend on that
// exact shape, and there is no version negotiation to change it safely.
// Cursor pagination is added without touching the body at all: an
// optional `?cursor=`/`?limit=` query param (the same convention
// src/lib/pagination.ts already uses elsewhere) selects the page, and
// the next cursor - if there are more notifications beyond this page -
// travels in an `X-Next-Cursor` response header instead of the body.
// An existing client that never sends `?cursor=` and never reads that
// header keeps getting exactly today's response: the 50 most recent
// notifications, as a bare array, byte-for-byte unchanged.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 50, not pagination.ts's shared default of 100 - preserves this
    // route's exact pre-existing page size for a caller who never sends
    // ?limit=.
    const { cursor, limit } = parseCursorParams(req, 50);

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        fromUser: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });

    const { items, nextCursor } = buildPage(notifications, limit);
    const res = NextResponse.json(items);
    if (nextCursor) res.headers.set("X-Next-Cursor", nextCursor);
    return res;
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// Mark notifications as read
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    return NextResponse.json({ error: "Failed to mark notifications read" }, { status: 500 });
  }
}
