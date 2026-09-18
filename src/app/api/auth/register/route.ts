import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, getRequestIp } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import { resolveCountryFromIp } from "@/lib/geo/ip-lookup";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

// ─── Signup acquisition classification (Phase 5/6 of the geo/acquisition
// mission - see docs/user-geography-and-acquisition.md) ─────────────
//
// Determined once, here, and never touched again - see the
// signupSource/signupCampaign/signupPlatform comments on the User model
// in prisma/schema.prisma for why this must be immutable.
//
// DIRECT is not a guess: it specifically means "no ref/utm parameter
// was present on this registration request" - a real, measurable fact,
// not an assumption about how the person actually found ZRP (that
// would require session-referrer tracking this app doesn't have, and
// this function never invents it). "Organic" (arrived via a search
// engine) and "direct" (typed the URL) are collapsed into this one
// DIRECT bucket for exactly that reason - ZRP cannot honestly tell them
// apart today.
type SignupAttribution = { source: "DIRECT" | "REFERRAL" | "CAMPAIGN"; campaign: string | null };

async function classifySignupAttribution(
  ref: unknown,
  utmSource: unknown,
  utmCampaign: unknown
): Promise<SignupAttribution> {
  if (typeof ref === "string" && ref.trim()) {
    const trimmedRef = ref.trim();
    const ambassador = await prisma.ambassadorProfile.findUnique({
      where: { invitationCode: trimmedRef },
      select: { id: true },
    });
    if (ambassador) {
      return { source: "REFERRAL", campaign: trimmedRef };
    }
    // An unrecognized `ref` value (typo'd, expired, or fabricated) must
    // NOT silently fall through to DIRECT - that would misclassify a
    // failed referral attempt as "no attribution attempted". CAMPAIGN
    // captures "something drove this signup, we just can't identify
    // exactly what" honestly, distinct from both REFERRAL and DIRECT.
    return { source: "CAMPAIGN", campaign: trimmedRef };
  }

  const campaignValue =
    (typeof utmCampaign === "string" && utmCampaign.trim()) ||
    (typeof utmSource === "string" && utmSource.trim()) ||
    null;
  if (campaignValue) {
    return { source: "CAMPAIGN", campaign: campaignValue };
  }

  return { source: "DIRECT", campaign: null };
}

export async function POST(req: NextRequest) {
  // Account creation had no rate limit at all - every signup also
  // creates a real database row and sends a real email, so this was
  // open to both mass spam-account creation and the same email-bombing
  // concern as the resend-verification endpoint.
  const limit = await rateLimit(req, { limit: 5, window: 3600, type: "auth-register" });
  if (!limit.success) return limit.response;

  try {
    const {
      name,
      username,
      email: rawEmail,
      password,
      ref,
      utmSource,
      utmCampaign,
    } = await req.json();

    // ─── Validation ──────────────────────────────────────────────
    if (!rawEmail || !password || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Login (auth.ts), forgot-password, and the Google OAuth signIn
    // callback all normalize the email to lowercase before querying.
    // Registration never did, so an account created as "User@x.com"
    // could never log back in - the login query for "user@x.com"
    // simply wouldn't match the row. Normalizing here (and everywhere
    // else this model's email is written or looked up) keeps every
    // entry point consistent.
    const email = String(rawEmail).trim().toLowerCase();

    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return NextResponse.json({ error: "Username must be 3-20 characters" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return NextResponse.json(
        { error: "Username can only contain letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    // ─── Check existing user (specific error per field) ────────────
    const existingEmail = await prisma.user.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered", field: "email" }, { status: 400 });
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username: { equals: trimmedUsername, mode: "insensitive" } },
    });
    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken", field: "username" }, { status: 400 });
    }

    // ─── Hash password & generate token ────────────────────────
    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // ─── Immutable signup snapshot ──────────────────────────────
    // signupCountryCode: local, in-process IP->country lookup - the raw
    // IP resolved by getRequestIp() is used for this one lookup and is
    // never written to the row below. See src/lib/geo/ip-lookup.ts.
    const requestIp = getRequestIp(req);
    const signupCountryCode = resolveCountryFromIp(requestIp);

    const attribution = await classifySignupAttribution(ref, utmSource, utmCampaign);

    // signupPlatform: native apps (Android/iOS) identify themselves via
    // this header on every request (see ApiClient.kt / ApiClient.swift);
    // its absence means the call came through the web app, the only
    // other caller of this route.
    const platformHeader = req.headers.get("x-zrp-platform");
    const signupPlatform =
      platformHeader === "android" || platformHeader === "ios" ? platformHeader : "web";

    // ─── Language (mutable going forward, best-effort at signup) ────
    // The `zrp-lang` cookie is set client-side by LanguageContext before
    // the signup form ever submits, so it's already present on this
    // request when the visitor changed language pre-signup. It's a
    // plain, non-httpOnly cookie a client could in principle tamper
    // with, so it's validated against the real supported-language list
    // rather than trusted as-is.
    const rawLangCookie = req.cookies.get("zrp-lang")?.value;
    const langCookie = SUPPORTED_LANGUAGES.some((l) => l.code === rawLangCookie)
      ? rawLangCookie
      : null;

    // ─── Create user (explicitly set role) ─────────────────────
    const user = await prisma.user.create({
      data: {
        name: name || null,
        username: trimmedUsername,
        email,
        password: hashed,
        role: "USER", // ✅ explicit default
        verificationToken: hashToken(token),
        verificationTokenExpiry: expiry,
        signupCountryCode,
        signupSource: attribution.source,
        signupCampaign: attribution.campaign,
        signupPlatform,
        languageCode: langCookie || null,
      },
    });

    // ─── Send verification email (non‑blocking) ────────────────
    sendVerificationEmail(email, token).catch((err) => {
      console.error("Email sending failed:", err);
    });

    return NextResponse.json(
      { message: "User created. Please check your email to verify your account." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    // Log the full error for debugging
    return NextResponse.json(
      { error: "Registration failed. Please try again later." },
      { status: 500 }
    );
  }
}
