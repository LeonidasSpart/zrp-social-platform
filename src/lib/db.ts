import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7+ requires an explicit driver adapter - `new PrismaClient()`
// with no adapter throws. Two pool settings are set explicitly because
// the underlying `pg` driver's own defaults are NOT the same as Prisma
// 6's Rust engine defaults, and both gaps are proven regressions, not
// theoretical:
//
// - connectionTimeoutMillis: `pg` has NO default connection timeout at
//   all - an unreachable/overloaded database hangs indefinitely instead
//   of failing fast. Proven by directly testing against a blackholed
//   address. 5000ms matches Prisma 6's own previous default.
// - max (pool size): `pg.Pool`'s hardcoded default is 10, lower than
//   what Prisma 6's engine used here. Proven by
//   api-keys/__tests__/route.integration.test.ts's 15-concurrent-request
//   test, which reproducibly failed under the `pg` default (requests
//   past the pool limit errored instead of queueing/completing) and
//   passes at 20. Tune against Railway Postgres's actual max_connections
//   and observed production concurrency before relying on this number
//   long-term - it is deliberately generous, not derived from a
//   production measurement.
// - statement_timeout / query_timeout: neither was set before, so a
//   query that gets stuck (lock contention, an unexpectedly expensive
//   plan under load) held its connection - and therefore a pool slot -
//   indefinitely, with nothing to fail it fast. statement_timeout is
//   enforced by Postgres itself (killed server-side even if the app
//   process is somehow not reading the socket); query_timeout is the
//   `pg` client's own belt-and-braces client-side backstop. 10s is well
//   under server.js's keepAliveTimeout/headersTimeout (65s/66s) and
//   under this adapter's own connectionTimeoutMillis budget, so a killed
//   query surfaces as a normal caught error/500 well before any
//   proxy-level timeout would otherwise turn it into a hung request.
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: 20,
    statement_timeout: 10_000,
    query_timeout: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
