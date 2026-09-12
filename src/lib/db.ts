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
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: 20,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
