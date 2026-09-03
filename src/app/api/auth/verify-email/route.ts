import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { consumeVerificationToken } from "@/lib/verify-email";

export async function GET(req: NextRequest) {
  // Prevent brute-forcing the verification token by request volume.
  const limit = await rateLimit(req, {
    limit: 20,
    window: 600,
    type: "auth-verify-email",
  });
  if (!limit.success) return limit.response;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  try {
    const result = await consumeVerificationToken(token);

    if (!result.ok) {
      const message = result.error === "missing_token" ? "Missing token" : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    /*
     * This route is hit by a direct browser navigation (the user
     * clicking the link in their email-change confirmation email, not
     * a page fetching it), so - unlike /api/auth/verify, which is
     * called from the /verify-email SPA page and expects JSON - it
     * needs to actually redirect somewhere.
     * NEXTAUTH_URL should normally be https://zrp.one in production.
     */
    const redirectUrl = new URL(
      "/login",
      process.env.NEXTAUTH_URL || "https://zrp.one"
    );
    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
