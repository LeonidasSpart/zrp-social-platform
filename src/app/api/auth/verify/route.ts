import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { consumeVerificationToken } from "@/lib/verify-email";

export async function GET(req: NextRequest) {
  // Prevent brute-forcing the verification token by request volume.
  const limit = await rateLimit(req, { limit: 20, window: 600, type: "auth-verify" });
  if (!limit.success) return limit.response;

  const token = req.nextUrl.searchParams.get("token");

  try {
    const result = await consumeVerificationToken(token);

    if (!result.ok) {
      const message = result.error === "missing_token" ? "Missing token" : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
  }
}
