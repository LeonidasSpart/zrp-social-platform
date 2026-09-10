import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { getFeatureStatus, FeatureStatus } from "./permissions";
import { checkRateLimitKey, getClientIpFromHeaders } from "./rate-limit";
import { getAppleClientSecret } from "./apple-client-secret";
import { applyAuthStateToToken, getUserAuthState } from "./auth-state";

// Only registered when APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_CLIENT_ID/
// APPLE_PRIVATE_KEY are all present and the key signs successfully - see
// apple-client-secret.ts. Missing/invalid config means Apple sign-in is
// simply absent from the providers list (NextAuth then errors cleanly on
// /api/auth/signin/apple) rather than the app pretending it's available.
const appleClientId = process.env.APPLE_CLIENT_ID;
const appleClientSecret = getAppleClientSecret();

// ─── Extend NextAuth types ────────────────────────────────────────
declare module "next-auth" {
  interface User {
    plan?: string;
    features?: FeatureStatus;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      username?: string | null;
      isAdmin?: boolean;
      role?: "USER" | "MODERATOR" | "ADMIN" | "JOURNALIST";
      badgeType?: string | null;
      avatarUrl?: string | null;
      onboardingCompleted?: boolean;
      banned?: boolean;
      emailVerified?: boolean;
      plan?: string;
      features?: FeatureStatus;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    features?: FeatureStatus;
  }
}

// Thrown by verifyCredentials with an HTTP status attached - NextAuth's
// own CredentialsProvider.authorize() only needs a thrown Error (it
// discards the specific message/status for its own generic
// "CredentialsSignin" browser-flow error), but the mobile JSON login
// endpoint (src/app/api/mobile/auth/login) needs both the real message
// and a status code to return a meaningful response to a native client.
export class CredentialsAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CredentialsAuthError";
    this.status = status;
  }
}

export interface VerifiedCredentialsUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  isAdmin: boolean;
  role: "USER" | "MODERATOR" | "ADMIN" | "JOURNALIST";
  badgeType: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  banned: boolean;
  emailVerified: boolean;
  plan: string;
}

// The single source of truth for verifying an email/username + password
// pair - shared by NextAuth's CredentialsProvider (the website's login
// flow, below) and the mobile JSON login endpoint. Extracted rather
// than duplicated so the two never drift apart on something
// security-sensitive like rate limiting or the accepted password
// format (bcrypt only - see below).
export async function verifyCredentials({
  identifier,
  password,
  ip,
}: {
  identifier: string;
  password: string;
  ip: string;
}): Promise<VerifiedCredentialsUser> {
  const isEmail = identifier.includes("@");

  // ⚠️ SECURITY: brute-force protection. Limit both by source IP
  // (protects against distributed guessing across many accounts)
  // and by the targeted account/email (protects a single account
  // from being hammered from many IPs). Either limit tripping
  // blocks the attempt with a generic error and a retry delay.
  const [ipLimit, acctLimit] = await Promise.all([
    checkRateLimitKey(`login-ip:${ip}`, 20, 900),
    checkRateLimitKey(`login-acct:${identifier.toLowerCase()}`, 8, 900),
  ]);

  if (!ipLimit.success || !acctLimit.success) {
    throw new CredentialsAuthError("Too many login attempts. Please try again later.", 429);
  }

  const user = await prisma.user.findUnique({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier },
    select: {
      id: true,
      email: true,
      password: true,
      name: true,
      username: true,
      isAdmin: true,
      role: true,
      badgeType: true,
      avatarUrl: true,
      onboardingCompleted: true,
      banned: true,
      emailVerified: true,
      plan: true,
    },
  });

  if (!user || !user.password) {
    throw new CredentialsAuthError("Invalid credentials", 401);
  }

  // ⚠️ SECURITY: bcrypt is the ONLY accepted password format. This used
  // to fall back to a plaintext equality check (`password ===
  // user.password`) for any stored value that didn't start with "$2",
  // "upgrading" the row to a hash on a successful login. That meant any
  // legacy row still held the user's real password in clear text in
  // the database until that user next logged in - a full-credential
  // leak for every such account in any database backup or read-access
  // compromise, and an equality comparison that wasn't even
  // constant-time. Legacy plaintext rows are migrated to bcrypt in
  // bulk, offline, by scripts/hash-legacy-passwords.ts (idempotent,
  // batched, never resets or logs a password) - run it before or
  // alongside deploying this change; after it has run there are no
  // non-bcrypt rows left for this code to ever see. A stored value
  // that is somehow still not a bcrypt hash simply fails to verify.
  let isValid = false;
  if (user.password.startsWith("$2")) {
    try {
      isValid = await bcrypt.compare(password, user.password);
    } catch (err) {
      console.error("Password comparison error:", err);
      isValid = false;
    }
  }

  if (!isValid) {
    throw new CredentialsAuthError("Invalid credentials", 401);
  }

  if (!user.emailVerified) {
    throw new CredentialsAuthError(
      "Please verify your email before logging in. Check your inbox for the verification link.",
      403
    );
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    isAdmin: user.isAdmin,
    role: user.role,
    badgeType: user.badgeType,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingCompleted,
    banned: user.banned || false,
    emailVerified: !!user.emailVerified,
    plan: user.plan || "free",
  };
}

// ─── Helper: generate a unique username from an email/name ─────────
async function generateUniqueUsername(base: string): Promise<string> {
  let candidate = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 15) || "user";

  if (candidate.length < 3) {
    candidate = candidate.padEnd(3, "0");
  }

  let username = candidate;
  let attempt = 0;

  while (await prisma.user.findUnique({ where: { username } })) {
    attempt += 1;
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    username = `${candidate.slice(0, 15 - suffix.length)}${suffix}`;
    if (attempt > 10) {
      // Extremely unlikely fallback
      username = `${candidate.slice(0, 10)}${Date.now().toString().slice(-6)}`;
      break;
    }
  }

  return username;
}

// The single source of truth for linking-or-creating an account for a
// verified OAuth identity (Google or Apple) - shared by NextAuth's own
// signIn callback (the website's browser OAuth flow, below) and the
// mobile Google sign-in endpoint (POST /api/mobile/auth/google), so a
// user who already exists - or is banned - is treated identically
// regardless of which client authenticated them. Returns the same
// shape verifyCredentials does, so both mobile auth endpoints build
// their session token from an identical user object. Returns null only
// when the matched existing account is banned; the caller decides how
// to surface that (NextAuth's signIn callback returns false, the
// mobile route returns 403).
export async function findOrCreateOAuthUser(
  email: string,
  name: string | null | undefined,
  image: string | null | undefined
): Promise<VerifiedCredentialsUser | null> {
  const normalizedEmail = email.toLowerCase();

  const select = {
    id: true,
    email: true,
    name: true,
    username: true,
    isAdmin: true,
    role: true,
    badgeType: true,
    avatarUrl: true,
    onboardingCompleted: true,
    banned: true,
    emailVerified: true,
    plan: true,
  } as const;

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select,
  });

  if (existing) {
    if (existing.banned) return null;
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      username: existing.username,
      isAdmin: existing.isAdmin,
      role: existing.role,
      badgeType: existing.badgeType,
      avatarUrl: existing.avatarUrl,
      onboardingCompleted: existing.onboardingCompleted,
      banned: existing.banned || false,
      emailVerified: !!existing.emailVerified,
      plan: existing.plan || "free",
    };
  }

  // ─── Create a new user for this Google/Apple account ──────────────
  const baseHandle = normalizedEmail.split("@")[0] || name || "user";
  const username = await generateUniqueUsername(baseHandle);

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      username,
      name: name || null,
      avatarUrl: image || null,
      password: null,
      emailVerified: new Date(),
      role: "USER",
      onboardingCompleted: false,
    },
    select,
  });

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    username: created.username,
    isAdmin: created.isAdmin,
    role: created.role,
    badgeType: created.badgeType,
    avatarUrl: created.avatarUrl,
    onboardingCompleted: created.onboardingCompleted,
    banned: created.banned || false,
    emailVerified: !!created.emailVerified,
    plan: created.plan || "free",
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    ...(appleClientId && appleClientSecret
      ? [
          AppleProvider({
            clientId: appleClientId,
            clientSecret: appleClientSecret,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        // ⚠️ SECURITY: resolved with the same trusted-proxy rule every
        // other limiter uses (see getClientIpFromHeaders) - the previous
        // "first X-Forwarded-For entry" was client-controlled, so a
        // brute-forcer could rotate a fake header value to get a fresh
        // login-attempt bucket on every try.
        const ip = getClientIpFromHeaders(
          req?.headers as Record<string, string | string[] | undefined> | undefined
        );

        // verifyCredentials throws CredentialsAuthError (a subclass of
        // Error) on any failure - NextAuth only needs a thrown Error
        // here to surface its own generic "CredentialsSignin" error to
        // the browser flow, so nothing further to translate.
        return await verifyCredentials({
          identifier: credentials.email.trim(),
          password: credentials.password.trim(),
          ip,
        });
      },
    }),
  ],
  callbacks: {
    // ─── Handle Google/Apple account creation / linking ─────────────
    // Both are OAuth providers verified by the provider itself before
    // ZRP ever sees the user, so both get the same treatment: link to an
    // existing account by email, or create a new pre-verified one. Apple
    // only includes `name` in the very first authorization (not in the
    // id_token on later sign-ins, and not surfaced by NextAuth's built-in
    // Apple profile() mapping at all) and never provides an avatar image -
    // both already fall back to null exactly like an incomplete Google
    // profile would.
    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "apple") {
        if (!user.email) return false;
        const result = await findOrCreateOAuthUser(user.email, user.name, user.image);
        return result !== null;
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      // ─── On initial sign‑in via Google or Apple ─────────────────
      if ((account?.provider === "google" || account?.provider === "apple") && user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.username = dbUser.username;
          token.isAdmin = dbUser.isAdmin;
          token.role = dbUser.role;
          token.badgeType = dbUser.badgeType;
          token.avatarUrl = dbUser.avatarUrl;
          token.onboardingCompleted = dbUser.onboardingCompleted;
          token.banned = dbUser.banned || false;
          token.emailVerified = !!dbUser.emailVerified;
          token.plan = dbUser.plan || "free";
          token.features = getFeatureStatus({ plan: token.plan });
        }
        return token;
      }

      // ─── On initial sign‑in via credentials ────────────────────
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.isAdmin = user.isAdmin;
        token.role = user.role;
        token.badgeType = user.badgeType;
        token.avatarUrl = user.avatarUrl;
        token.onboardingCompleted = user.onboardingCompleted;
        token.banned = user.banned || false;
        token.emailVerified = !!user.emailVerified;
        token.plan = (user as any).plan || "free";
        token.features = getFeatureStatus({ plan: token.plan });
      }

      // ─── Re‑fetch fresh data on client update() ────────────────
      // Also re-fetches username/name/avatarUrl: settings/page.tsx's
      // own handleUpdateProfile calls update() right after a save, and
      // any route resolving "my own profile" through session.user.username
      // (rather than the stable session.user.id) - e.g. GET
      // /users/{username} keyed off it - 404s until this catches up.
      // name/avatarUrl go stale from that same save (header avatar,
      // menus) for the same reason - neither was in this select either.
      if (trigger === "update" && token.id) {
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            username: true,
            name: true,
            avatarUrl: true,
            isAdmin: true,
            role: true,
            badgeType: true,
            onboardingCompleted: true,
            banned: true,
            emailVerified: true,
            plan: true,
          },
        });
        if (freshUser) {
          token.username = freshUser.username;
          token.name = freshUser.name;
          token.avatarUrl = freshUser.avatarUrl;
          token.isAdmin = freshUser.isAdmin;
          token.role = freshUser.role;
          token.badgeType = freshUser.badgeType;
          token.onboardingCompleted = freshUser.onboardingCompleted;
          token.banned = freshUser.banned || false;
          token.emailVerified = !!freshUser.emailVerified;
          token.plan = freshUser.plan || "free";
          token.features = getFeatureStatus({ plan: token.plan });
        }
      }

      // ─── Periodic existence re-check for routine (non-login) reads ──
      // The two branches above only refetch from the database on initial
      // sign-in or an explicit client update() call. A routine session
      // read (getServerSession, useSession's background polling) never
      // touched the database at all, so a JWT for an account deleted
      // after it was issued kept authenticating as that user for the
      // rest of the token's lifetime (up to 30 days) - the app, and
      // every API route trusting session.user.id, had no way to know.
      // Re-checking on every single read would add a DB round trip to
      // every authenticated request, so this throttles to once every 5
      // minutes per token. Reusing `banned` rather than inventing a new
      // signal is deliberate: middleware.ts and every downstream
      // consumer already correctly treat banned === true as "sign this
      // session out" (redirect, cleared cookies, blocked API writes),
      // so a deleted account is handled by that exact same, already-
      // proven path instead of a new one.
      //
      // This same window also refreshes token.username. A rename
      // otherwise stayed frozen in the JWT at whatever it was when the
      // token was minted - the trigger === "update" branch above never
      // covered it (its own select never asked for username), and
      // nothing else in this callback ever re-read it either. That's
      // not just a stale display name: any route resolving "my own
      // profile" through session.user.username (rather than the stable
      // session.user.id) - e.g. GET /users/{username} keyed off it -
      // 404s the instant a rename takes effect server-side but the
      // active session's own copy hasn't caught up, for up to 30 days.
      // Riding the existing 5-minute existence check to also pick this
      // up needs no separate client-side update() round trip.
      //
      // ⚠️ SECURITY (privileged-claim staleness): this same read is now
      // also where isAdmin / role / plan / banned get refreshed, via
      // the authoritative, briefly-cached getUserAuthState() (see
      // auth-state.ts). Before, those claims were only ever written at
      // sign-in or on an explicit update(), so a demoted admin or a
      // banned user kept whatever privileges their token was minted
      // with - for the token's whole 30-day life, and forever for a
      // native-app token that is never re-encoded. The old 5-minute
      // throttle is gone: the per-instance cache (30s) already bounds
      // the cost to at most one indexed primary-key lookup per user per
      // window, and it never persisted for route-handler reads anyway
      // (a route handler can't rewrite the cookie), so this is not more
      // database load than before - it's the same lookup, now carrying
      // the claims that actually matter. Nothing here invalidates a
      // session whose claims haven't changed.
      if (token.id && !user && trigger !== "update") {
        const state = await getUserAuthState(token.id as string);
        const refreshed = applyAuthStateToToken(
          token as unknown as Record<string, unknown>,
          state
        );
        Object.assign(token, refreshed);
      }

      return token;
    },
    async session({ session, token }) {
      // ⚠️ SECURITY: a banned (or deleted - see auth-state.ts) account
      // gets NO session at all, rather than a session whose user object
      // merely carries banned: true. Every API route in this app gates
      // on `session?.user?.id`; almost none of them re-check
      // `session.user.banned`, so the flag alone left a banned user
      // fully authorized for every mutation. Returning null here makes
      // getServerSession() resolve to null (401 everywhere) and makes
      // the browser's useSession() report "unauthenticated" - the same
      // signed-out state middleware.ts already redirects a banned user
      // into. Non-banned users are entirely unaffected.
      if (token.banned === true) {
        return null as unknown as typeof session;
      }

      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.role = token.role as "USER" | "MODERATOR" | "ADMIN" | "JOURNALIST";
        session.user.badgeType = token.badgeType as string || null;
        session.user.avatarUrl = token.avatarUrl as string || null;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
        session.user.banned = token.banned || false;
        session.user.emailVerified = token.emailVerified || false;
        session.user.plan = token.plan as string || "free";
        session.user.features = token.features as FeatureStatus || getFeatureStatus({ plan: session.user.plan });
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
