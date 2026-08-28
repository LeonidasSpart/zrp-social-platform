import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

/**
 * Prisma's Decimal (used for every money field - see the schema)
 * serializes to a STRING through JSON.stringify, not a number. Money
 * fields are stored/computed as Decimal specifically to avoid binary
 * floating-point drift, but that precision doesn't need to survive
 * the API boundary - the frontend has always received (and does
 * arithmetic/formatting on) plain numbers here. This walks an
 * arbitrary response payload and converts every Decimal instance back
 * to a number before it's serialized, so API responses keep their
 * existing shape regardless of which fields happen to be Decimal.
 *
 * Amounts here are always small enough (platform/creator money, ad
 * budgets) to round-trip through a JS number with no meaningful loss -
 * this is purely an API-shape concern, not a re-introduction of the
 * precision bug the Decimal migration fixed at the storage/calculation
 * layer.
 */
export function toPlainJson<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => toPlainJson(v)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = toPlainJson((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return value;
}

/**
 * Drop-in replacement for NextResponse.json() for any route whose
 * payload might contain Prisma Decimal values (directly or nested).
 */
export function jsonWithDecimals<T>(
  data: T,
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(toPlainJson(data), init);
}
