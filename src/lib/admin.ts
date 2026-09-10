import { getServerSession, type Session } from "next-auth";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";
import { getUserAuthState, isAdminState, isModeratorState } from "./auth-state";

// Explicit discriminated union return type. Without this, TypeScript
// widens the `authorized: true/false` literals to plain `boolean` on
// inferred return types, which breaks control-flow narrowing at call
// sites - `if (!adminCheck.authorized) return adminCheck.response;`
// would no longer guarantee `adminCheck.session` is defined afterward,
// even though it always is at runtime.
type AdminCheckResult =
  | { authorized: true; session: Session }
  | { authorized: false; response: NextResponse };

// ⚠️ SECURITY: these used to trust session.user.role / session.user.isAdmin
// FIRST and only fall back to the database when the session had no role.
// Those session claims are a snapshot from when the JWT was minted, so an
// admin demoted in the database kept passing every admin check until
// their token happened to be re-issued - never, for a native-app token.
// Every check below now asks the database (uncached - admin traffic is
// tiny and a demotion must land on the very next request) and treats the
// session purely as proof of identity. The exported names and result
// shape are unchanged so no admin route needs to change.

async function checkRole(allowed: (state: Awaited<ReturnType<typeof getUserAuthState>>) => boolean): Promise<AdminCheckResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const state = await getUserAuthState(session.user.id, { fresh: true });
  if (!state.exists || state.banned) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (allowed(state)) {
    return { authorized: true, session };
  }

  return { authorized: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function requireAdmin(): Promise<AdminCheckResult> {
  return checkRole(isAdminState);
}

/**
 * Non-throwing admin check for routes that mix "owner OR admin" logic
 * (e.g. support tickets) rather than gating the whole route on admin
 * access. Same authoritative database check as requireAdmin(), so a
 * route using this can't silently disagree with the rest of the app
 * about who counts as an admin.
 */
export async function isSessionAdmin(session: Session | null | undefined): Promise<boolean> {
  if (!session?.user?.id) return false;
  const state = await getUserAuthState(session.user.id, { fresh: true });
  return isAdminState(state);
}

export async function requireStaff(): Promise<AdminCheckResult> {
  return checkRole(isModeratorState);
}
