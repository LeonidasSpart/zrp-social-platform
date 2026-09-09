import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";
import crypto from "crypto";
import { checkRateLimitKey } from "./rate-limit";

// Per-key limit, independent of the per-IP limits elsewhere - a single
// leaked or scripted-too-aggressively key shouldn't be able to hammer
// the API indefinitely just because its calls come from many IPs.
const API_KEY_RATE_LIMIT = 120;
const API_KEY_RATE_WINDOW_SECONDS = 60;

// ⚠️ SECURITY: every key gets an expiry. POST /api/api-keys always
// documented "default: 365 days" but only set one when the client asked
// for it - a request that omitted expiresInDays produced a key that
// never expired, so the intended default was silently "forever". A key
// issued without an explicit lifetime now expires after
// DEFAULT_KEY_LIFETIME_DAYS; nothing may be issued for longer than
// MAX_KEY_LIFETIME_DAYS. Keys that already exist are not touched by
// this (validateApiKey still honours a null expiresAt on stored rows).
export const DEFAULT_KEY_LIFETIME_DAYS = 365;
export const MAX_KEY_LIFETIME_DAYS = 365;

/** Expiry for a key issued now with the (optional) requested lifetime. */
export function apiKeyExpiryFor(expiresInDays: unknown, now: number = Date.now()): Date {
  const requestedDays =
    typeof expiresInDays === "number" && Number.isFinite(expiresInDays) && expiresInDays > 0
      ? Math.ceil(expiresInDays)
      : DEFAULT_KEY_LIFETIME_DAYS;
  const lifetimeDays = Math.min(Math.max(requestedDays, 1), MAX_KEY_LIFETIME_DAYS);
  return new Date(now + lifetimeDays * 24 * 60 * 60 * 1000);
}

export async function validateApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const plainKey = authHeader.slice(7); // remove "Bearer "
  const hash = crypto.createHash("sha256").update(plainKey).digest("hex");

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash: hash,
      revoked: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          plan: true,
          avatarUrl: true,
          banned: true,
        },
      },
    },
  });

  if (!apiKey) {
    return { error: "Invalid or expired API key", status: 401 };
  }

  // ⚠️ SECURITY: an API key is a long-lived credential minted from a
  // session; a ban must revoke it just as it revokes the session. This
  // check is new - previously a banned account's keys kept working for
  // as long as they were valid.
  if (apiKey.user.banned) {
    return { error: "Invalid or expired API key", status: 401 };
  }

  const limit = await checkRateLimitKey(
    `api-key:${apiKey.id}`,
    API_KEY_RATE_LIMIT,
    API_KEY_RATE_WINDOW_SECONDS
  );
  if (!limit.success) {
    return { error: "Too many requests for this API key. Please slow down.", status: 429 };
  }

  // Update lastUsed timestamp
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  // Don't hand the ban flag onward as part of the "user" an API caller
  // is treated as - it's an authorization input here, not profile data.
  const { banned: _banned, ...user } = apiKey.user;
  return { user, key: apiKey };
}
