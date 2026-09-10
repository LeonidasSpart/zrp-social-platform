import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/*
 * ============================================================
 * Identifier resolution (email / username -> User row)
 * ============================================================
 *
 * User.email and User.username are both `@unique` in Postgres, which is
 * CASE-SENSITIVE: "Leo@Example.com" and "leo@example.com" are two
 * different keys. Registration now lowercases emails on write (commit
 * f85d193) and has always rejected a username that differs from an
 * existing one only by case (`mode: "insensitive"`), so from the
 * application's point of view an identifier names exactly one account
 * regardless of case. Two things broke that contract in production:
 *
 *   1. Rows written before registration normalized emails still hold
 *      mixed-case addresses. Every lookup that lowercased the typed
 *      value before an exact `findUnique` (login, forgot-password, the
 *      Google/Apple link step, resend-verification) could not see them
 *      at all - not even when the user typed the address exactly as
 *      registered - so those accounts were locked out of every flow,
 *      and Google sign-in silently created a second, empty lowercase
 *      account instead of linking. (f85d193 fixed the write path only
 *      and recorded that existing rows were not retroactively fixed.)
 *   2. Login compared usernames exactly while registration compared
 *      them case-insensitively, so "Leo" could register but "leo" - or
 *      "Leo" auto-capitalized by a phone keyboard as "LEO" - could not
 *      log in.
 *
 * This is the single resolver every read boundary uses instead:
 *   - exact match first (an indexed unique lookup - the normal path
 *     costs nothing extra), then for emails the lowercased form (also
 *     indexed, catches "Leo@x.com" typed against a normalized row);
 *   - only if neither matches, a case-insensitive scan;
 *   - if that scan finds MORE than one row (rows differing only by
 *     case - the duplicates the OAuth bug above created), they are
 *     returned oldest-first so callers can prefer the original account,
 *     and password login tries each candidate's own hash rather than
 *     guessing which one the user meant.
 *
 * Nothing here changes what counts as a valid credential: a candidate
 * is only ever used after its own password / provider identity has
 * been verified by the caller.
 *
 * ⚠️ SECURITY: the case-insensitive step is a parameterized
 * `lower(column) = lower($1)` comparison, deliberately NOT Prisma's
 * `mode: "insensitive"`. On Postgres that mode compiles to ILIKE, and
 * ILIKE treats `%` and `_` in the VALUE as wildcards - verified against
 * a real database: `%@example.com` matched an arbitrary account. An
 * identifier typed into a login form must never be able to select
 * accounts by pattern.
 */

export type IdentifierKind = "email" | "username";

type UserWhereUnique = Prisma.UserWhereUniqueInput;

function uniqueWhere(kind: IdentifierKind, value: string): UserWhereUnique {
  return kind === "email" ? { email: value } : { username: value };
}

/**
 * Every account an identifier could refer to, best match first:
 * exact-as-typed, then (emails) exact-lowercase, then any remaining
 * case-insensitive matches oldest-first. At most `limit` rows, deduped.
 */
export async function findUsersByIdentifier<S extends Prisma.UserSelect>(
  kind: IdentifierKind,
  rawIdentifier: string,
  select: S,
  limit = 3
): Promise<Prisma.UserGetPayload<{ select: S }>[]> {
  const value = rawIdentifier.trim();
  if (!value) return [];

  type Row = Prisma.UserGetPayload<{ select: S }> & { id: string };
  // `id` is always selected so candidates can be deduplicated; the
  // caller's declared shape is what they get back.
  const selectWithId = { ...select, id: true } as unknown as S;

  const found: Row[] = [];
  const seen = new Set<string>();
  const push = (candidate: unknown) => {
    const row = candidate as Row | null;
    if (row && !seen.has(row.id)) {
      seen.add(row.id);
      found.push(row);
    }
  };

  push(await prisma.user.findUnique({ where: uniqueWhere(kind, value), select: selectWithId }));

  if (kind === "email") {
    const lowered = value.toLowerCase();
    if (lowered !== value) {
      push(await prisma.user.findUnique({ where: uniqueWhere(kind, lowered), select: selectWithId }));
    }
  }

  if (found.length === 0) {
    const ids = await findIdsCaseInsensitive(kind, value, limit);
    if (ids.length > 0) {
      const rows = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: selectWithId,
      });
      const byId = new Map(rows.map((row) => [(row as { id: string }).id, row]));
      ids.forEach((id) => push(byId.get(id)));
    }
  }

  return found.slice(0, limit);
}

// Exact equality after case folding on both sides - a plain string
// comparison, never a pattern match. Oldest account first, so a caller
// that needs exactly one can prefer the original over a later duplicate.
async function findIdsCaseInsensitive(
  kind: IdentifierKind,
  value: string,
  limit: number
): Promise<string[]> {
  const column = kind === "email" ? Prisma.sql`"email"` : Prisma.sql`"username"`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE lower(${column}) = lower(${value})
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}

/** The single best-matching account for an identifier, or null. */
export async function findUserByIdentifier<S extends Prisma.UserSelect>(
  kind: IdentifierKind,
  rawIdentifier: string,
  select: S
): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
  const [first] = await findUsersByIdentifier(kind, rawIdentifier, select, 1);
  return first ?? null;
}

/** True when any account already uses this username in any casing. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const exact = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (exact) return true;
  const ids = await findIdsCaseInsensitive("username", username, 1);
  return ids.length > 0;
}
