import { NextRequest, NextResponse } from "next/server";
import { sendPushNotification } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

// server.js (the raw Node/Socket.IO process - not a Next.js request
// context, so it cannot import this route's TS module tree directly)
// calls this over an internal loopback request whenever "call-user" is
// relayed, so a recipient whose app is backgrounded/minimized/the tab
// isn't focused still gets a real OS-level notification for an
// incoming call - not just the in-page "incoming-call" socket event,
// which only does anything while that page is actually rendering it.
// Same CRON_SECRET-style bearer-secret pattern as /api/cron/*: fails
// CLOSED if the secret is unset, and is never reachable from outside
// this same process/host since nothing publishes this path to a
// client. Reuses the existing, already-tested sendPushNotification
// (Web Push + FCM) rather than a second, duplicated implementation.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.INTERNAL_PUSH_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { receiverId, callerName, callerUsername, isVideo } = await req.json();
    if (
      typeof receiverId !== "string" ||
      !receiverId ||
      typeof callerName !== "string" ||
      !callerName ||
      typeof callerUsername !== "string" ||
      !callerUsername
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Title makes the call type unmistakable at a glance - this must
    // never read like an ordinary message notification (mission
    // requirement: a recipient has to be able to tell VOICE vs VIDEO
    // call apart from a normal DM without opening the app).
    await sendPushNotification(
      receiverId,
      isVideo === true ? "Incoming video call" : "Incoming voice call",
      `${callerName} is calling you`,
      `/messages/${callerUsername}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("call-push internal route error:", err);
    // Never let a push failure look like a caller-facing error - the
    // in-app socket "incoming-call" path already reached anyone with
    // the page open; this is a best-effort supplementary channel only.
    return NextResponse.json({ ok: false });
  }
}
