import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ─── POST /api/users/[username]/notify-posts: toggle "notify me when
// this account posts" - same toggle-a-relationship-row shape as
// /api/users/mute and the follow route, not separate enable/disable
// endpoints: subscribed <=> the row exists, so there's exactly one
// state to keep in sync, not two.
export async function POST(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriberId = session.user.id;

  try {
    const author = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });
    if (!author) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const authorId = author.id;

    if (subscriberId === authorId) {
      return NextResponse.json({ error: "Cannot subscribe to your own posts" }, { status: 400 });
    }

    // ⚠️ SECURITY/PRIVACY: same rule as follow/mute - a blocked-either-way
    // relationship must never let a subscription form, not only be
    // suppressed later at notification time.
    if (await isBlockedEitherWay(subscriberId, authorId)) {
      return NextResponse.json({ error: "Cannot subscribe to this user" }, { status: 403 });
    }

    const existing = await prisma.postSubscription.findUnique({
      where: { subscriberId_authorId: { subscriberId, authorId } },
    });

    if (existing) {
      try {
        await prisma.postSubscription.delete({
          where: { subscriberId_authorId: { subscriberId, authorId } },
        });
      } catch (err) {
        // Already gone (a concurrent unsubscribe won the race) - same
        // outcome the caller wanted, not a 500.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) throw err;
      }
      return NextResponse.json({ subscribed: false });
    }

    try {
      await prisma.postSubscription.create({
        data: { subscriberId, authorId },
      });
    } catch (err) {
      // A concurrent subscribe already created it - same outcome, not a 500.
      if (!isUniqueViolation(err)) throw err;
      return NextResponse.json({ subscribed: true });
    }

    return NextResponse.json({ subscribed: true });
  } catch (error) {
    console.error("Post-subscription toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle post notifications" }, { status: 500 });
  }
}

// ─── GET /api/users/[username]/notify-posts: is the caller currently
// subscribed to this profile's posts.
export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const author = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });
    if (!author) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const subscription = await prisma.postSubscription.findUnique({
      where: {
        subscriberId_authorId: { subscriberId: session.user.id, authorId: author.id },
      },
    });
    return NextResponse.json({ subscribed: !!subscription });
  } catch (error) {
    console.error("Post-subscription status error:", error);
    return NextResponse.json({ error: "Failed to check post notification status" }, { status: 500 });
  }
}
