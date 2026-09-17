"use client";

import { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

// `session` is the server-resolved session (see src/app/layout.tsx,
// which is already an async server component reading cookies for the
// language attributes below it) - passing it here lets next-auth skip
// its own client-side fetch to /api/auth/session on first load
// entirely, since it already knows the answer. Without this,
// useSession() on every page starts in "loading" and only resolves
// after that extra network round trip, which previously blocked the
// home feed's own data fetch from even starting until it completed - a
// real, measurable serial delay on a route middleware already
// guarantees is authenticated before this component's JS ever runs.
export function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
