import { Prisma } from "@prisma/client";

/*
 * ⚠️ Prisma 7+ driver-adapter architecture: a Postgres serialization
 * failure (SQLSTATE 40001) detected DURING a query inside the
 * transaction still surfaces the same way as before - a
 * PrismaClientKnownRequestError with code P2034. But a write-skew
 * conflict between a SELECT count() and a concurrent INSERT is often
 * only detected by Postgres's serializable snapshot isolation at
 * COMMIT time - and a commit-time conflict surfaces instead as a raw,
 * unwrapped DriverAdapterError (kind "TransactionWriteConflict") from
 * @prisma/adapter-pg, never reaching the P2034 wrapping at all.
 * Checked structurally (not `instanceof` against
 * @prisma/driver-adapter-utils, a transitive dependency this app
 * doesn't declare directly) and against the raw Postgres SQLSTATE
 * rather than a Prisma-internal shape, so this keeps working even if
 * Prisma's own wrapping changes again. Extracted from
 * src/app/api/api-keys/route.ts (the original count()-then-create()
 * race fix) so every count-then-create Serializable transaction in
 * this codebase shares one tested implementation instead of
 * duplicating this quirk-handling.
 */
export function isSerializationConflict(err: unknown): boolean {
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
