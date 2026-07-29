import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      avatarUrl?: string | null;
      isAdmin?: boolean;  // ← Add this
    };
  }

  interface User {
    id: string;
    username: string;
    avatarUrl?: string | null;
    isAdmin?: boolean;   // ← Add this
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    avatarUrl?: string | null;
    isAdmin?: boolean;   // ← Add this
  }
}
