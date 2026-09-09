import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import net from "net";
import { getRedisClient, getCached, setCached } from "@/lib/redis";
import { acquirePipelineLock } from "../lock";

/*
 * Integration coverage against a REAL Redis server (no mock, no fake
 * client): the pipeline lock is the thing standing between "two cycles
 * overlapped" and "the platform published everything twice", so its
 * actual SET NX PX semantics are worth exercising against the real
 * implementation rather than an in-memory stand-in.
 *
 * Skipped automatically when REDIS_URL is not set, exactly like the
 * Postgres suites skip without DATABASE_URL.
 */
const hasRedis = !!(process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL);

/**
 * Closes a client without assuming which teardown method this
 * node-redis version exposes (destroy/disconnect/quit differ across
 * v4 minors). Best-effort: this is test cleanup, not an assertion.
 * Module-scoped so every describe block below can share it.
 */
async function closeClient(candidate: any): Promise<void> {
  if (!candidate) return;
  for (const method of ["disconnect", "quit", "destroy"]) {
    if (typeof candidate[method] === "function") {
      try {
        await candidate[method]();
      } catch {
        // Already gone - nothing to clean up.
      }
      return;
    }
  }
}

describe.skipIf(!hasRedis)("Redis integration (real server)", () => {
  beforeAll(async () => {
    const redis = await getRedisClient();
    expect(redis, "expected a live Redis connection").not.toBeNull();
  });

  afterEach(async () => {
    const redis = await getRedisClient();
    await redis?.del("news:pipeline:lock");
  });

  it("connects to the configured server and round-trips a cached value", async () => {
    const key = `news:test:${Date.now()}`;
    await setCached(key, { hello: "world", n: 42 }, 30);
    expect(await getCached<{ hello: string; n: number }>(key)).toEqual({ hello: "world", n: 42 });

    const redis = await getRedisClient();
    await redis?.del(key);
  });

  it("returns null for a key that does not exist rather than throwing", async () => {
    expect(await getCached(`news:test:absent:${Date.now()}`)).toBeNull();
  });

  it("expires a cached value at its TTL", async () => {
    const key = `news:test:ttl:${Date.now()}`;
    await setCached(key, { a: 1 }, 1);

    const redis = await getRedisClient();
    const ttl = await redis?.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1);
  });

  it("grants the pipeline lock to exactly one caller", async () => {
    const first = await acquirePipelineLock(60);
    expect(first).not.toBeNull();

    // This is the real scenario: the cron fires while a manual run from
    // the admin console is still going. The second one must get nothing.
    const second = await acquirePipelineLock(60);
    expect(second).toBeNull();

    await first!.release();

    const third = await acquirePipelineLock(60);
    expect(third).not.toBeNull();
    await third!.release();
  });

  it("sets a bounded TTL on the lock so a crashed cycle cannot wedge the pipeline forever", async () => {
    const lock = await acquirePipelineLock(60);
    expect(lock).not.toBeNull();

    const redis = await getRedisClient();
    const ttl = await redis?.pTTL("news:pipeline:lock");

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);

    await lock!.release();
  });

  it("releases the lock so the next cycle can take it", async () => {
    const lock = await acquirePipelineLock(60);
    await lock!.release();

    const redis = await getRedisClient();
    expect(await redis?.exists("news:pipeline:lock")).toBe(0);
  });

  it("lets the lock lapse on its own once the TTL passes", async () => {
    const lock = await acquirePipelineLock(1);
    expect(lock).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1200));

    // A process that died mid-cycle without releasing must not block the
    // next one indefinitely.
    const next = await acquirePipelineLock(60);
    expect(next).not.toBeNull();
    await next!.release();
  });

  it("serialises a burst of concurrent acquisition attempts to a single winner", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => acquirePipelineLock(60))
    );

    const winners = attempts.filter((lock) => lock !== null);
    expect(winners).toHaveLength(1);

    await winners[0]!.release();
  });
});

/*
 * Regression coverage for the permanent-disable bug.
 *
 * A TCP proxy sits between the client and the real Redis server so a
 * connection can be broken and restored inside one process - a network
 * blip, a Redis restart, a failover.
 *
 * The outage is simulated by refusing and dropping connections while a
 * flag is set, NOT by closing the listener: node-redis reconnects
 * instantly, so server.close() would never complete.
 *
 * Before the fix, the first error latched a module-level `clientError`
 * that nothing ever cleared, so getRedisClient() returned null for the
 * rest of the process lifetime - and the news pipeline, which fails
 * closed without its lock, stopped publishing until the next deploy.
 */
describe.skipIf(!hasRedis)("Redis resilience (real server behind a breakable proxy)", () => {
  const PROXY_PORT = 6390;

  let proxy: net.Server | null = null;
  let live: net.Socket[] = [];
  let broken = false;

  // Resolved ONCE, before any test repoints REDIS_URL at this proxy.
  // Reading it lazily made the proxy forward to itself.
  const realUpstream = (() => {
    const url = new URL(
      process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL || "redis://127.0.0.1:6379"
    );
    return { host: url.hostname, port: Number(url.port || 6379) };
  })();

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      proxy = net.createServer((incoming) => {
        if (broken) {
          incoming.destroy();
          return;
        }
        const { host, port } = realUpstream;
        const out = net.connect(port, host);
        incoming.pipe(out);
        out.pipe(incoming);
        incoming.on("error", () => {});
        out.on("error", () => {});
        live.push(incoming, out);
      });
      proxy.listen(PROXY_PORT, "127.0.0.1", () => resolve());
    });
  });

  afterAll(async () => {
    broken = false;
    live.forEach((socket) => socket.destroy());
    live = [];
    await new Promise<void>((resolve) => {
      if (!proxy) return resolve();
      proxy.close(() => resolve());
      proxy.unref();
    });
  });

  function cutConnections() {
    broken = true;
    live.forEach((socket) => socket.destroy());
    live = [];
  }

  function restoreConnections() {
    broken = false;
  }

  async function withProxyUrl<T>(run: (redisUrl: string) => Promise<T>): Promise<T> {
    const originalUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = `redis://127.0.0.1:${PROXY_PORT}`;
    vi.resetModules();
    try {
      return await run(process.env.REDIS_URL);
    } finally {
      restoreConnections();
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
      vi.resetModules();
    }
  }

  it("recovers on its own after a transient connection failure, with no redeploy", async () => {
    await withProxyUrl(async () => {
      const redisModule = await import("@/lib/redis");

      const before = await redisModule.getRedisClient();
      expect(before, "should connect through the proxy").not.toBeNull();

      // The blip.
      cutConnections();
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Fail-soft while it is down: callers get null and fall back.
      expect(await redisModule.getRedisClient()).toBeNull();

      // Redis comes back.
      restoreConnections();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const after = await redisModule.getRedisClient();
      expect(after, "must recover without a process restart").not.toBeNull();
      expect(await after!.ping()).toBe("PONG");

      await closeClient(after);
    });
  }, 30000);

  it("keeps the pipeline lock working after Redis recovers", async () => {
    await withProxyUrl(async () => {
      const lockModule = await import("../lock");
      const redisModule = await import("@/lib/redis");

      const first = await lockModule.acquirePipelineLock(60);
      expect(first).not.toBeNull();
      await first!.release();

      cutConnections();
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Fails closed while Redis is unreachable: no lock, no cycle, so
      // two cycles can never publish at once.
      expect(await lockModule.acquirePipelineLock(60)).toBeNull();

      restoreConnections();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const recovered = await lockModule.acquirePipelineLock(60);
      expect(recovered, "the pipeline must be able to run again").not.toBeNull();
      await recovered!.release();

      await closeClient(await redisModule.getRedisClient());
    });
  }, 30000);

  it("does not build a new client per concurrent caller during a cold start", async () => {
    await withProxyUrl(async () => {
      const redisModule = await import("@/lib/redis");

      // Twenty simultaneous callers on a cold cache must share one
      // connection attempt, not start twenty of their own.
      const clients = await Promise.all(
        Array.from({ length: 20 }, () => redisModule.getRedisClient())
      );

      const distinct = new Set(clients.filter(Boolean));
      expect(distinct.size).toBe(1);

      await closeClient(Array.from(distinct)[0]);
    });
  }, 30000);
});

/*
 * Regression coverage for a second, distinct hang - found while
 * preparing a Railway-console validation script and confirmed by
 * probing getRedisClient() and acquirePipelineLock() directly.
 *
 * The mid-life-outage tests above prove recovery AFTER a connection
 * that once succeeded. This is different: Redis unreachable from the
 * very first attempt (wrong REDIS_URL, the service not up yet, a
 * partition from boot). node-redis's default reconnectStrategy retries
 * forever and never rejects connect() on its own, so before the fix
 * `await created.connect()` inside getRedisClient() simply never
 * settled - and because `connecting` is shared by every caller, that
 * hung EVERY consumer of Redis application-wide (rate limiting,
 * link-preview caching, and the news pipeline's lock), not just this
 * one, for as long as the process ran.
 */
describe("Redis cold-start unreachability (never connects, not merely dropped)", () => {
  const UNREACHABLE_URL = "redis://127.0.0.1:19998";
  // Comfortably above INITIAL_CONNECT_TIMEOUT_MS (8s in src/lib/redis.ts)
  // so a regression (an unbounded hang) fails this test rather than
  // timing the whole suite out silently.
  const MUST_SETTLE_WITHIN_MS = 15_000;

  afterEach(() => {
    vi.resetModules();
  });

  it("getRedisClient() reports unavailable instead of hanging forever", async () => {
    const originalUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = UNREACHABLE_URL;
    vi.resetModules();

    try {
      const redisModule = await import("@/lib/redis");

      const started = Date.now();
      const result = await Promise.race([
        redisModule.getRedisClient(),
        new Promise((resolve) => setTimeout(() => resolve("DID_NOT_SETTLE"), MUST_SETTLE_WITHIN_MS)),
      ]);

      expect(result, "must not hang past its own bounded connect window").not.toBe("DID_NOT_SETTLE");
      expect(result).toBeNull();
      expect(Date.now() - started).toBeLessThan(MUST_SETTLE_WITHIN_MS);
    } finally {
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
    }
  }, 20000);

  it("acquirePipelineLock() fails closed quickly rather than hanging the whole cycle", async () => {
    const originalUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = UNREACHABLE_URL;
    vi.resetModules();

    try {
      const lockModule = await import("../lock");

      const started = Date.now();
      const result = await Promise.race([
        lockModule.acquirePipelineLock(60),
        new Promise((resolve) => setTimeout(() => resolve("DID_NOT_SETTLE"), MUST_SETTLE_WITHIN_MS)),
      ]);

      expect(result, "a cycle must fail closed, not hang, when Redis was never reachable").not.toBe(
        "DID_NOT_SETTLE"
      );
      expect(result).toBeNull();
      expect(Date.now() - started).toBeLessThan(MUST_SETTLE_WITHIN_MS);
    } finally {
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
    }
  }, 20000);

  it("a later call recovers automatically if that same unreachable Redis eventually comes up", async () => {
    // Uses a real proxy (like the mid-life tests) so the "eventually
    // comes up" half of this is genuine, not simulated.
    const port = 48210;
    let live: any[] = [];
    let broken = true;
    const net2 = await import("net");
    const proxy = net2.createServer((incoming: any) => {
      if (broken) return incoming.destroy();
      const out = net2.connect(6379, "127.0.0.1");
      incoming.pipe(out);
      out.pipe(incoming);
      incoming.on("error", () => {});
      out.on("error", () => {});
      live.push(incoming, out);
    });
    await new Promise<void>((resolve) => proxy.listen(port, "127.0.0.1", () => resolve()));

    const originalUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    vi.resetModules();

    try {
      const redisModule = await import("@/lib/redis");

      // First call: unreachable from the start, bounded failure.
      const first = await redisModule.getRedisClient();
      expect(first).toBeNull();

      // The real Redis becomes reachable through the proxy.
      broken = false;

      // node-redis's own background reconnectStrategy (never destroyed,
      // never given up on) should pick this up without anyone calling
      // getRedisClient() again in the meantime - poll until it does.
      let recovered = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        recovered = await redisModule.getRedisClient();
        if (recovered) break;
      }

      expect(recovered, "must recover once the same client's background retry succeeds").not.toBeNull();
      expect(await (recovered as any).ping()).toBe("PONG");

      await closeClient(recovered);
    } finally {
      broken = true;
      live.forEach((s) => s.destroy());
      live = [];
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
      vi.resetModules();
    }
  }, 30000);
});
