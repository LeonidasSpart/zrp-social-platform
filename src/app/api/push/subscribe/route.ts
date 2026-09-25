import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimitKey } from "@/lib/rate-limit";

// ⚠️ SECURITY: sendPushNotification POSTs to whatever endpoint is stored
// here, from the server. An arbitrary client-supplied URL would let any
// user make the server issue requests to hosts of their choosing (SSRF).
// Real Web Push endpoints are always https on a browser vendor's push
// service, so only those hosts are accepted.
const PUSH_SERVICE_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

function isValidPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isValidKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keyed per account, not per IP: PushNotificationManager re-posts the
  // (unchanged) subscription on every session refetch, i.e. on window
  // focus, so an IP-wide hourly cap would 429 ordinary users behind a
  // shared or carrier NAT and silently drop a genuinely new subscription.
  const limited = await checkRateLimitKey(`push-subscribe:${session.user.id}`, 120, 3600);
  if (!limited.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retryAfter: limited.retryAfter },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const { subscription, previousEndpoint } = await req.json();

    if (
      !subscription ||
      typeof subscription !== "object" ||
      !isValidPushEndpoint(subscription.endpoint) ||
      !subscription.keys ||
      !isValidKey(subscription.keys.p256dh) ||
      !isValidKey(subscription.keys.auth)
    ) {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }
    const keys = { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth };

    // Upsert subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        keys,
        userId: session.user.id,
      },
      create: {
        endpoint: subscription.endpoint,
        keys,
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
