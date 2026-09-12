import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessApi } from "@/lib/permissions";
import { apiKeyExpiryFor } from "@/lib/api-auth";
import crypto from "crypto";

// ─── Helper: Generate a secure API key ─────────────────────────────
function generateApiKey(): { plain: string; hash: string } {
  const plain = `zrp_${crypto.randomBytes(24).toString("hex")}`; // 48 chars hex + prefix
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

// Unbounded key issuance was an open door to silently accumulating
// long-lived credentials - cap how many a single account can hold at
// once (revoked keys don't count against this).
const MAX_ACTIVE_KEYS_PER_USER = 10;
const MAX_KEYS_MESSAGE = `You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active API keys. Revoke one before creating another.`;

class MaxActiveKeysError extends Error {}

// ⚠️ Prisma 7+ driver-adapter architecture: a Postgres serialization
// failure (SQLSTATE 40001) detected DURING a query inside the
// transaction still surfaces the same way as before - a
// PrismaClientKnownRequestError with code P2034. But this route's own
// conflict is a write-skew between a SELECT count() and a concurrent
// INSERT, which Postgres's serializable snapshot isolation frequently
// only detects at COMMIT time - and a commit-time conflict surfaces
// instead as a raw, unwrapped DriverAdapterError (kind
// "TransactionWriteConflict") from @prisma/adapter-pg, never reaching
// the P2034 wrapping at all. Reproduced directly: identical concurrent
// load that reliably retried-then-succeeded under Prisma 6 instead hit
// unhandled 500s under Prisma 7 until this second check was added.
// Checked structurally (not `instanceof` against
// @prisma/driver-adapter-utils, a transitive dependency this app
// doesn't declare directly) and against the raw Postgres SQLSTATE
// rather than a Prisma-internal shape, so this keeps working even if
// Prisma's own wrapping changes again.
function isSerializationConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
    return true;
  }
  const cause = (err as { name?: string; cause?: { originalCode?: string } } | null)?.cause;
  return (
    err instanceof Error &&
    err.name === "DriverAdapterError" &&
    cause?.originalCode === "40001"
  );
}

// ⚠️ SECURITY: count-then-create was a check-then-act race - two
// concurrent POSTs could both read a count under the limit and both
// insert, letting an account exceed MAX_ACTIVE_KEYS_PER_USER. Serializable
// isolation makes Postgres detect that write skew and abort one of the
// two transactions (surfaced by Prisma as P2034) instead of letting both
// commit; the caller retries once, which is enough for two genuinely
// concurrent requests to resolve into "one succeeds, one sees the real,
// now-current count and is correctly rejected."
async function createApiKeyAtomic(
  userId: string,
  name: string,
  expiresAt: Date | null
) {
  return prisma.$transaction(
    async (tx) => {
      const activeKeyCount = await tx.apiKey.count({
        where: { userId, revoked: false },
      });
      if (activeKeyCount >= MAX_ACTIVE_KEYS_PER_USER) {
        throw new MaxActiveKeysError();
      }

      const { plain, hash } = generateApiKey();
      const apiKey = await tx.apiKey.create({
        data: { userId, name, keyHash: hash, expiresAt },
        select: { id: true, name: true, expiresAt: true, createdAt: true },
      });

      return { apiKey, plain };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

// ─── GET: List all API keys for the user ──────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    // Check if user has API access (Business/Enterprise)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user || !canAccessApi(user)) {
      return NextResponse.json(
        { error: "API access requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId, revoked: false },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
        revoked: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("API keys GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST: Generate a new API key ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user || !canAccessApi(user)) {
      return NextResponse.json(
        { error: "API access requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, expiresInDays } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: every key gets an expiry. The comment here always said
    // "default: 365 days", but the code only set one when the client
    // asked for it - a request that omitted expiresInDays produced a key
    // that never expired (and validateApiKey accepts a null expiresAt),
    // so the intended default was silently "forever". Now: omitted →
    // DEFAULT_KEY_LIFETIME_DAYS; anything asked for is clamped to
    // [1, MAX_KEY_LIFETIME_DAYS]. Keys that already exist are not
    // touched by this (see api-auth.ts for how existing keys are read).
    const expiresAt = apiKeyExpiryFor(expiresInDays);

    // isSerializationConflict: Postgres detected a serialization conflict
    // against another concurrent request to the same account. Each retry
    // re-reads the real, now-current count, so a handful of attempts is
    // enough for even a burst of concurrent requests to converge on the
    // correct outcome (some succeed up to the cap, the rest are correctly
    // rejected) instead of surfacing as a 500.
    const MAX_SERIALIZATION_RETRIES = 5;
    let result: Awaited<ReturnType<typeof createApiKeyAtomic>> | undefined;
    for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        result = await createApiKeyAtomic(userId, name.trim(), expiresAt);
        break;
      } catch (err) {
        if (err instanceof MaxActiveKeysError) {
          return NextResponse.json({ error: MAX_KEYS_MESSAGE }, { status: 400 });
        }
        const conflict = isSerializationConflict(err);
        if (!conflict || attempt === MAX_SERIALIZATION_RETRIES) {
          if (conflict) {
            return NextResponse.json(
              { error: "Too many concurrent requests. Please try again." },
              { status: 409 }
            );
          }
          throw err;
        }
      }
    }

    if (!result) {
      // Unreachable: every loop exit path above either sets `result` and
      // breaks, or returns/throws. Guards TypeScript's narrowing and any
      // future refactor of the loop above.
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Return the plain key (only once!)
    return NextResponse.json({
      key: result.apiKey,
      plainKey: result.plain, // <-- this is the actual token
      warning: "Store this key securely. It will not be shown again.",
    });
  } catch (error) {
    console.error("API keys POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
