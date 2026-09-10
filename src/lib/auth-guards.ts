import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { getToken, type JWT } from "next-auth/jwt";
import { authOptions } from "./auth";
import { prisma } from "./db";
import {
  applyAuthStateToToken,
  getUserAuthState,
  isAdminState,
  isModeratorState,
  type UserAuthState,
} from "./auth-state";

export {
  getUserAuthState,
  invalidateUserAuthState,
  applyAuthStateToToken,
  isAdminState,
  isModeratorState,
  type UserAuthState,
  type AuthRole,
} from "./auth-state";

/*
 * ============================================================
 * Request-level authorization guards
 * ============================================================
 *
 * Built on auth-state.ts (the authoritative, briefly-cached view of a
 * user's role/isAdmin/plan/banned). Every helper here answers "may THIS
 * request do THIS" from the database's current answer, never from a
 * claim frozen into a JWT at login time - see auth-state.ts for why
 * that distinction matters.
 */

type Denied = { ok: false; response: NextResponse };

export type AuthenticatedResult =
  | { ok: true; session: Session; userId: string }
  | Denied;

export type ActiveUserResult =
  | { ok: true; session: Session; userId: string; state: UserAuthState }
  | Denied;

export type PrivilegedResult =
  | { ok: true; session: Session; userId: string; state: UserAuthState }
  | Denied;

function unauthorized(): Denied {
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

function forbidden(message = "Forbidden"): Denied {
  return { ok: false, response: NextResponse.json({ error: message }, { status: 403 }) };
}

/**
 * The caller has a valid, non-banned session. Because the session
 * callback (auth.ts) returns no session at all for a banned or deleted
 * account, a session object here already implies the account is
 * active as of the last authoritative check.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();
  return { ok: true, session, userId: session.user.id };
}

/**
 * Like requireAuthenticatedUser, but re-reads the user's state from the
 * database on this exact request (no cache). Use before actions where
 * even a few seconds of staleness would matter.
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth;

  const state = await getUserAuthState(auth.userId, { fresh: true });
  if (!state.exists) return unauthorized();
  if (state.banned) return forbidden("Account banned");

  return { ok: true, session: auth.session, userId: auth.userId, state };
}

async function requireRole(allowed: (state: UserAuthState) => boolean): Promise<PrivilegedResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth;

  // Always fresh: an admin demoted a moment ago must not keep acting as
  // one for even the length of the cache window.
  const state = await getUserAuthState(auth.userId, { fresh: true });
  if (!state.exists) return unauthorized();
  if (state.banned) return forbidden("Account banned");
  if (!allowed(state)) return forbidden();

  return { ok: true, session: auth.session, userId: auth.userId, state };
}

/** ADMIN role (or the legacy isAdmin flag), verified against the database. */
export function requireAdmin(): Promise<PrivilegedResult> {
  return requireRole(isAdminState);
}

/** ADMIN or MODERATOR, verified against the database. */
export function requireModerator(): Promise<PrivilegedResult> {
  return requireRole(isModeratorState);
}

/*
 * ============================================================
 * getToken() routes
 * ============================================================
 *
 * Routes that read the raw JWT with next-auth/jwt's getToken() never
 * pass through the jwt()/session() callbacks, so nothing above would
 * ever refresh their view of the token. getVerifiedToken() is a
 * drop-in with the same call signature: decode exactly as getToken()
 * does, then overlay the authoritative state, returning null (i.e.
 * "not authenticated") for a banned or deleted account.
 */
export async function getVerifiedToken(
  params: Parameters<typeof getToken>[0]
): Promise<JWT | null> {
  const token = (await getToken(params)) as JWT | string | null;
  // `raw: true` returns the encoded string; nothing here uses it, and a
  // raw token can't be verified against user state, so treat as absent.
  if (!token || typeof token === "string") return null;

  const userId = typeof token.id === "string" ? token.id : null;
  if (!userId) return token;

  const state = await getUserAuthState(userId);
  if (!state.exists || state.banned) return null;

  return applyAuthStateToToken(token as unknown as Record<string, unknown>, state) as unknown as JWT;
}

/*
 * ============================================================
 * Resource ownership / membership
 * ============================================================
 */

/** True when `userId` sent or received the message. */
export async function isMessageParticipant(messageId: string, userId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true, receiverId: true },
  });
  return !!message && (message.senderId === userId || message.receiverId === userId);
}

/** True when `userId` is the message's original sender. */
export async function isMessageSender(messageId: string, userId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true },
  });
  return !!message && message.senderId === userId;
}

/**
 * True when a direct-message conversation exists between the two users
 * (at least one message in either direction). Used to authorize
 * conversation-scoped relays where the underlying message may already
 * be gone (e.g. a delete notification).
 */
export async function isConversationParticipant(userId: string, otherUserId: string): Promise<boolean> {
  if (!userId || !otherUserId || userId === otherUserId) return false;
  const message = await prisma.message.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    },
    select: { id: true },
  });
  return !!message;
}

/** True when either user has blocked the other. */
export async function isBlockedEitherWay(userId: string, otherUserId: string): Promise<boolean> {
  const block = await prisma.blocked.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !!block;
}
