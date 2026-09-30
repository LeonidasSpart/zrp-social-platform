import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

/*
 * src/lib/serialize-decimal.ts's jsonWithDecimals() converts every
 * Prisma.Decimal to a JS Number - correct and documented as such for
 * money fields (tips, ad budgets), which are "always small enough to
 * round-trip through a JS number with no meaningful loss."
 *
 * Launchpad amounts are NOT in that category: LaunchedToken.supply,
 * VestingContract.totalAmount/totalReleased are raw SPL base units
 * (supply * 10^decimals). A modest 1 billion-token supply at 9 decimals
 * is already 1e18 - past Number.MAX_SAFE_INTEGER (~9.007e15) - so
 * .toNumber() would silently corrupt the very value a client needs to
 * render a user's real balance correctly. Every Decimal here is
 * serialized as its exact base-10 string instead (Decimal.toFixed(0),
 * which never produces exponential notation, unlike plain toString()
 * for very large magnitudes).
 */
export function toPlainJsonWithDecimalStrings<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return value.toFixed(0) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => toPlainJsonWithDecimalStrings(v)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = toPlainJsonWithDecimalStrings((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return value;
}

export function jsonWithDecimalStrings<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(toPlainJsonWithDecimalStrings(data), init);
}
