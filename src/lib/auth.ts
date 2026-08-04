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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Invalid credentials");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        // ─── BLOCK LOGIN IF EMAIL NOT VERIFIED ───────────────────────
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
          emailVerified: !!user.emailVerified, // ✅ boolean
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
        token.emailVerified = !!user.emailVerified; // ✅ explicit boolean conversion
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
          },
        });
        if (freshUser) {
          token.isAdmin = freshUser.isAdmin;
          token.role = freshUser.role;
          token.badgeType = freshUser.badgeType;
          token.onboardingCompleted = freshUser.onboardingCompleted;
          token.banned = freshUser.banned || false;
          token.emailVerified = !!freshUser.emailVerified; // ✅ boolean
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
        session.user.emailVerified = token.emailVerified || false; // ✅ boolean
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
