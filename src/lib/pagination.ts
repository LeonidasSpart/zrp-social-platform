import { NextRequest } from "next/server";

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;

export interface CursorParams {
  cursor: string | null;
  limit: number;
}

/**
 * Reads ?cursor= and ?limit= off the request, clamping limit to a
 * sane range so a client can't force an oversized page.
 */
export function parseCursorParams(req: NextRequest): CursorParams {
  const cursor = req.nextUrl.searchParams.get("cursor");
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { cursor, limit };
}

/**
 * Given a batch fetched with `take: limit + 1` (the standard
 * overfetch-by-one trick), splits it into the page to return plus the
 * next cursor - or null once there's nothing left. `items` must
 * already be in the query's sort order.
 */
export function buildPage<T extends { id: string }>(
  items: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  if (items.length > limit) {
    const page = items.slice(0, limit);
    return { items: page, nextCursor: page[page.length - 1].id };
  }
  return { items, nextCursor: null };
}
