import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription, previousEndpoint } = await req.json();

    // Upsert subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        keys: subscription.keys,
        userId: session.user.id,
      },
      create: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userId: session.user.id,
      },
    });

    // The client resubscribed because the VAPID public key changed, so
    // the endpoint it replaced can never receive another notification -
    // every send to it would fail with a 403 that the delivery loop does
    // not prune (it only prunes 404/410). Delete that one row.
    //
    // Scoped to this user's own subscriptions and to an endpoint the
    // caller has just demonstrably replaced, so it cannot be used to
    // remove anyone else's.
    if (
      typeof previousEndpoint === "string" &&
      previousEndpoint &&
      previousEndpoint !== subscription.endpoint
    ) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: previousEndpoint, userId: session.user.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscription error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
