import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// Nothing shows up in browser devtools when testing from an iPad/phone
// with no console access, so call-related events (ICE state changes,
// peer errors, TURN fetch failures) had no way to reach anywhere the
// person could actually see them. This logs them straight to the
// Railway server console instead - same place server.js's own logs
// already show up - so a failed call attempt leaves a visible trail
// without needing browser devtools at all.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "call-diagnostics" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { event, detail } = await req.json();
    if (!event || typeof event !== "string") {
      return NextResponse.json({ error: "event is required" }, { status: 400 });
    }

    console.log(
      `📞🔍 call-diagnostics [${session.user.username}]: ${event}`,
      detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ""
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("call-diagnostics error:", error);
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }
}
