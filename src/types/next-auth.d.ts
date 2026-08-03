import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: "USER" | "MODERATOR" | "ADMIN";
      onboardingCompleted: boolean;
      banned: boolean; // ✅ ADDED
      name?: string | null;
      email?: string | null;
      image?: string | null;
      avatarUrl?: string | null;
      isAdmin?: boolean;
      badgeType?: string | null;
    };
  }

  interface User {
    id: string;
    username: string;
    role: "USER" | "MODERATOR" | "ADMIN";
    onboardingCompleted: boolean;
    banned?: boolean; // ✅ ADDED
    avatarUrl?: string | null;
    isAdmin?: boolean;
    badgeType?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: "USER" | "MODERATOR" | "ADMIN";
    onboardingCompleted: boolean;
    banned: boolean; // ✅ ADDED
    avatarUrl?: string | null;
    isAdmin?: boolean;
    badgeType?: string | null;
  }
}
