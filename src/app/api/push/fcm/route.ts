import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// A real FCM registration token is well under this, but tokens can
// grow over time as Google's format evolves - this is an abuse guard,
// not a spec-accurate length check.
const MAX_TOKEN_LENGTH = 4096;

// Registers this device's Firebase Cloud Messaging token against the
// signed-in user, for the native Android app (see android-native's
// PushRepository.kt). Upserts on the token itself, not userId + token,
// so a device that logs into a different ZRP account correctly moves
// that one token to the new owner instead of accumulating stale rows.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "push-fcm-register" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await req.json();

    if (typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (token.length > MAX_TOKEN_LENGTH) {
      return NextResponse.json({ error: "token is too long" }, { status: 400 });
    }

    await prisma.fcmToken.upsert({
      where: { token },
      update: { userId: session.user.id },
      create: { token, userId: session.user.id, platform: "android" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FCM token registration error:", error);
    return NextResponse.json({ error: "Failed to register token" }, { status: 500 });
  }
}

// Removes this device's token, called on logout so a signed-out device
// stops receiving pushes meant for the account that just signed out.
export async function DELETE(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "push-fcm-unregister" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await req.json();

    if (typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    // Scoped to the caller's own userId so a token can't be deleted by
    // whoever happens to know its value rather than whoever owns it.
    await prisma.fcmToken.deleteMany({
      where: { token, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FCM token unregistration error:", error);
    return NextResponse.json({ error: "Failed to unregister token" }, { status: 500 });
  }
}
