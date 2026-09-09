import { prisma } from "./db";
import { getFeatureStatus } from "./permissions";

/*
 * ============================================================
 * Authoritative authorization state
 * ============================================================
 *
 * ⚠️ SECURITY: a NextAuth JWT is a self-contained signed token. Every
 * privilege-bearing claim it carries - isAdmin, role, plan, banned - is
 * a snapshot from whenever the token was minted. The website's cookie
 * is re-issued by NextAuth's own session polling, but a token minted for
 * a native client (POST /api/mobile/auth/*) is never re-encoded at all,
 * so an admin demoted in the database kept admin access, and a banned
 * user kept a fully working session, for the whole 30-day lifetime of
 * whatever token they already held.
 *
 * This module is the single authoritative source for those claims. It
 * reads the User row (cached briefly per instance so hot paths don't
 * pay a DB round trip on every request) and every consumer of a
 * privileged claim goes through it - see auth-guards.ts for the
 * request-level helpers built on top, and auth.ts for how the jwt()
 * callback refreshes a token's claims from it on every read.
 *
 * Deliberately has no import of auth.ts (which imports this), so the
 * two never form a module cycle.
 *
 * No existing session is invalidated by any of this. A user whose
 * claims haven't changed sees exactly the session they had; only the
 * users whose authorization actually changed are affected.
 */

export type AuthRole = "USER" | "MODERATOR" | "ADMIN" | "JOURNALIST";

export interface UserAuthState {
  id: string;
  exists: boolean;
  banned: boolean;
  isAdmin: boolean;
  role: AuthRole;
  plan: string;
  username: string;
}

// Short per-instance cache. 30s bounds how long a stale claim can
// survive on an instance that didn't process the change itself;
// invalidateUserAuthState() makes it instant on the instance that did.
export const AUTH_STATE_TTL_MS = 30_000;

interface CacheEntry {
  state: UserAuthState;
  expiresAt: number;
}

const authStateCache = new Map<string, CacheEntry>();

// Keep the map from growing without bound on a long-lived process.
const AUTH_STATE_CACHE_MAX = 50_000;
function sweepAuthStateCache(now: number) {
  if (authStateCache.size < AUTH_STATE_CACHE_MAX) return;
  authStateCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) authStateCache.delete(key);
  });
  if (authStateCache.size >= AUTH_STATE_CACHE_MAX) authStateCache.clear();
}

function missingState(userId: string): UserAuthState {
  return {
    id: userId,
    exists: false,
    banned: true,
    isAdmin: false,
    role: "USER",
    plan: "free",
    username: "",
  };
}

/**
 * Drop any cached authorization state for a user. Call this from every
 * code path that changes a user's role, isAdmin, plan or banned flag so
 * the change takes effect immediately on this instance rather than at
 * the end of the cache window.
 */
export function invalidateUserAuthState(userId: string): void {
  authStateCache.delete(userId);
}

/**
 * The authoritative privilege state for a user, straight from the
 * database (cached for AUTH_STATE_TTL_MS per instance unless
 * `fresh: true`). A user row that no longer exists reports
 * `exists: false, banned: true` so every caller treats a deleted
 * account exactly like a banned one - the same "sign this session out"
 * path middleware.ts and the session callback already implement.
 */
export async function getUserAuthState(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<UserAuthState> {
  const now = Date.now();

  if (!options.fresh) {
    const cached = authStateCache.get(userId);
    if (cached && cached.expiresAt > now) return cached.state;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      banned: true,
      isAdmin: true,
      role: true,
      plan: true,
      username: true,
    },
  });

  const state: UserAuthState = user
    ? {
        id: user.id,
        exists: true,
        banned: user.banned === true,
        isAdmin: user.isAdmin === true,
        role: user.role as AuthRole,
        plan: user.plan || "free",
        username: user.username,
      }
    : missingState(userId);

  sweepAuthStateCache(now);
  authStateCache.set(userId, { state, expiresAt: now + AUTH_STATE_TTL_MS });
  return state;
}

/**
 * Overlay the authoritative state onto a decoded JWT so downstream code
 * reading token.role / token.isAdmin / token.plan / token.banned sees
 * the database's answer, not the snapshot from when the token was
 * minted. Shared by the jwt() callback and getVerifiedToken().
 */
export function applyAuthStateToToken<T extends Record<string, unknown>>(
  token: T,
  state: UserAuthState
): T {
  if (!state.exists || state.banned) {
    return { ...token, banned: true };
  }
  return {
    ...token,
    banned: false,
    isAdmin: state.isAdmin,
    role: state.role,
    plan: state.plan,
    username: state.username,
    features: getFeatureStatus({ plan: state.plan }),
  };
}

export function isAdminState(state: UserAuthState): boolean {
  return state.exists && !state.banned && (state.role === "ADMIN" || state.isAdmin);
}

export function isModeratorState(state: UserAuthState): boolean {
  return isAdminState(state) || (state.exists && !state.banned && state.role === "MODERATOR");
}

/** Exposed for tests only. */
export function __resetAuthStateCacheForTests(): void {
  authStateCache.clear();
}
