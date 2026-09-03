import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { getFeatureStatus, FeatureStatus } from "./permissions";
import { checkRateLimitKey } from "./rate-limit";
import { getAppleClientSecret } from "./apple-client-secret";

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

        const identifier = credentials.email.trim();
        const inputPassword = credentials.password.trim();
        const isEmail = identifier.includes("@");

        // ⚠️ SECURITY: brute-force protection. Limit both by source IP
        // (protects against distributed guessing across many accounts)
        // and by the targeted account/email (protects a single account
        // from being hammered from many IPs). Either limit tripping
        // blocks the attempt with a generic error and a retry delay.
        const forwardedFor = req?.headers?.["x-forwarded-for"];
        const ip =
          (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
            ?.split(",")[0]
            ?.trim() ||
          (req?.headers as Record<string, string> | undefined)?.["x-real-ip"] ||
          "unknown";

        const [ipLimit, acctLimit] = await Promise.all([
          checkRateLimitKey(`login-ip:${ip}`, 20, 900),
          checkRateLimitKey(`login-acct:${identifier.toLowerCase()}`, 8, 900),
        ]);

        if (!ipLimit.success || !acctLimit.success) {
          throw new Error("Too many login attempts. Please try again later.");
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
          throw new Error("Invalid credentials");
        }

        let isValid = false;
        try {
          isValid = await bcrypt.compare(inputPassword, user.password);
        } catch (err) {
          console.error("Password comparison error:", err);
          isValid = false;
        }

        // ⚠️ SECURITY: legacy accounts with a non-bcrypt (plaintext)
        // stored password are still supported here for backward
        // compatibility, upgrading them to a real bcrypt hash on
        // successful login. This should be treated as a known, tracked
        // risk, not a permanent design - see the security audit notes
        // for a recommended remediation plan (identify affected
        // accounts and force a password reset, then remove this
        // fallback entirely once no legacy plaintext passwords remain).
        if (!isValid && !user.password.startsWith('$2')) {
          isValid = inputPassword === user.password;
          if (isValid) {
            const hashed = await bcrypt.hash(inputPassword, 10);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: hashed },
            });
          }
        }

        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        if (!user.emailVerified) {
          throw new Error(
            "Please verify your email before logging in. Check your inbox for the verification link."
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

        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });

        if (existing) {
          if (existing.banned) return false;
          return true;
        }

        // ─── Create a new user for this Google/Apple account ──────
        const baseHandle = user.email.split("@")[0] || user.name || "user";
        const username = await generateUniqueUsername(baseHandle);

        await prisma.user.create({
          data: {
            email: user.email.toLowerCase(),
            username,
            name: user.name || null,
            avatarUrl: user.image || null,
            password: null,
            emailVerified: new Date(),
            role: "USER",
            onboardingCompleted: false,
          },
        });
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
      if (trigger === "update" && token.id) {
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
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

      return token;
    },
    async session({ session, token }) {
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
