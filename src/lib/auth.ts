import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const inputPassword = credentials.password.trim();

        console.log("🔑 Login attempt for:", credentials.email);
        console.log("🔑 Input password length:", inputPassword.length);

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          // ✅ Include plan field
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
            plan: true, // ✅ added
          },
        });

        if (!user || !user.password) {
          console.log("🔑 User not found or password missing");
          throw new Error("Invalid credentials");
        }

        console.log("🔑 Stored hash prefix:", user.password.substring(0, 10));
        console.log("🔑 Stored hash length:", user.password.length);

        let isValid = false;
        try {
          isValid = await bcrypt.compare(inputPassword, user.password);
          console.log("🔑 bcrypt.compare result:", isValid);
        } catch (err) {
          console.error("🔑 bcrypt.compare error:", err);
          isValid = false;
        }

        if (!isValid && !user.password.startsWith('$2')) {
          console.log("🔑 Falling back to plain‑text compare");
          isValid = inputPassword === user.password;
          if (isValid) {
            console.log("🔑 Plain‑text match – upgrading hash");
            const hashed = await bcrypt.hash(inputPassword, 10);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: hashed },
            });
          }
        }

        if (!isValid) {
          console.log("🔑 ❌ Invalid credentials – password mismatch");
          throw new Error("Invalid credentials");
        }

        if (!user.emailVerified) {
          console.log("🔑 ❌ Email not verified for:", user.email);
          throw new Error(
            "Please verify your email before logging in. Check your inbox for the verification link."
          );
        }

        console.log("🔑 ✅ Login successful for:", user.email);

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
          plan: user.plan || "free", // ✅ added
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
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
        token.plan = (user as any).plan || "free"; // ✅ added
      }

      // ─── Re-fetch fresh data from DB whenever the client calls update() ───
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
            plan: true, // ✅ added
          },
        });
        if (freshUser) {
          token.isAdmin = freshUser.isAdmin;
          token.role = freshUser.role;
          token.badgeType = freshUser.badgeType;
          token.onboardingCompleted = freshUser.onboardingCompleted;
          token.banned = freshUser.banned || false;
          token.emailVerified = !!freshUser.emailVerified;
          token.plan = freshUser.plan || "free"; // ✅ added
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.role = token.role as "USER" | "MODERATOR" | "ADMIN";
        session.user.badgeType = token.badgeType as string || null;
        session.user.avatarUrl = token.avatarUrl as string || null;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
        session.user.banned = token.banned || false;
        session.user.emailVerified = token.emailVerified || false;
        session.user.plan = token.plan as string || "free"; // ✅ added
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
