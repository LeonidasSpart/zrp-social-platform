import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// A PushKit VoIP token is a distinct subscription from an ordinary
// FcmToken/APNs alert token (see prisma/schema.prisma's VoipToken doc
// comment) - registered from PKPushRegistry, not
// UNUserNotificationCenter, and used only for the "voip" APNs topic.
// This is intentionally a separate endpoint from /api/push/fcm rather
// than an overload of it: there is no existing VoIP-push registration
// route to reuse (Android/Web have no VoIP-push equivalent), so this is
// new surface, not a duplicate of anything.
const MAX_TOKEN_LENGTH = 4096;

// Only "ios" exists today - PushKit is an Apple-only API - but the
// column mirrors FcmToken.platform's shape for consistency and in case
// a future platform ever needs the same distinction.
const KNOWN_PLATFORMS = new Set(["ios"]);

function resolvePlatform(raw: unknown): string {
  if (typeof raw === "string" && KNOWN_PLATFORMS.has(raw.toLowerCase())) {
    return raw.toLowerCase();
  }
  return "ios";
}

// Registers this device's VoIP token against the signed-in user.
// Upserts on the token itself, not userId + token, matching
// /api/push/fcm's reasoning: a device that logs into a different ZRP
// account correctly moves that one token to the new owner instead of
// accumulating stale rows.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "push-voip-register" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token, platform: rawPlatform } = await req.json();

    if (typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (token.length > MAX_TOKEN_LENGTH) {
      return NextResponse.json({ error: "token is too long" }, { status: 400 });
    }

    const platform = resolvePlatform(rawPlatform);

    await prisma.voipToken.upsert({
      where: { token },
      update: { userId: session.user.id, platform },
      create: { token, userId: session.user.id, platform },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("VoIP token registration error:", error);
    return NextResponse.json({ error: "Failed to register token" }, { status: 500 });
  }
}

// Removes this device's VoIP token, called on logout so a signed-out
// device stops being reachable for incoming-call pushes meant for the
// account that just signed out.
export async function DELETE(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "push-voip-unregister" });
  if (!limit.success) return limit.response!;

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
    await prisma.voipToken.deleteMany({
      where: { token, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("VoIP token unregistration error:", error);
    return NextResponse.json({ error: "Failed to unregister token" }, { status: 500 });
  }
}
