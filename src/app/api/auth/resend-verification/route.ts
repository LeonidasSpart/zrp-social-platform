import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { resendVerificationEmail } from "@/lib/resend-verification";

export async function POST(req: NextRequest) {
  // This endpoint is unauthenticated by necessity (a user who can't log
  // in yet still needs to be able to request a new verification email),
  // which is exactly why it needs a strict limit - without one, it's an
  // open email-bombing vector against any address, since it accepts
  // whatever email is put in the request body and always sends real mail.
  const limit = await rateLimit(req, { limit: 3, window: 600, type: "resend-verification" });
  if (!limit.success) return limit.response;

  try {
    const { email: rawIdentifier } = await req.json();

    if (!rawIdentifier) {
      return NextResponse.json(
        { error: "Email required", code: "MISSING_IDENTIFIER" },
        { status: 400 }
      );
    }

    // The login form's field is labeled "Email or Username" and accepts
    // either (see authorize() in lib/auth.ts) - this action is triggered
    // directly from that same form's "unverified" error, so it must
    // resolve the identifier the same way, not assume it's always an
    // email address.
    const result = await resendVerificationEmail(String(rawIdentifier));

    if (!result.ok) {
      const status = result.code === "USER_NOT_FOUND" ? 404 : 400;
      const error =
        result.code === "USER_NOT_FOUND" ? "User not found" : "Email already verified";
      return NextResponse.json({ error, code: result.code }, { status });
    }

    return NextResponse.json({ message: "Verification email sent", code: "SENT" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "Failed to resend verification", code: "RESEND_FAILED" },
      { status: 500 }
    );
  }
}
