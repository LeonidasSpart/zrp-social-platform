import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";
import crypto from "crypto";
import { checkRateLimitKey } from "./rate-limit";

// Per-key limit, independent of the per-IP limits elsewhere - a single
// leaked or scripted-too-aggressively key shouldn't be able to hammer
// the API indefinitely just because its calls come from many IPs.
const API_KEY_RATE_LIMIT = 120;
const API_KEY_RATE_WINDOW_SECONDS = 60;

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
          // include other fields as needed
        },
      },
    },
  });

  if (!apiKey) {
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

  return { user: apiKey.user, key: apiKey };
}
