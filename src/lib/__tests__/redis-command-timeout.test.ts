import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * ⚠️ RELIABILITY regression coverage: getCached()/setCached() used to
 * await redis.get()/redis.set() directly with no bound on the command
 * itself - node-redis has no default per-command timeout, and the only
 * existing timeout in this module (INITIAL_CONNECT_TIMEOUT_MS) only
 * covers the very first cold-start connect() call. A client that is
 * "ready" (isReady: true) but slow to answer a specific command - a
 * degraded, not fully down, Redis - could previously hang getCached/
 * setCached indefinitely, and since callers like
 * src/app/api/posts/explore/route.ts `await setCached(...)` before
 * responding, that hang reached all the way to the HTTP response.
 * These tests prove a slow-but-ready client's commands are now bounded
 * and degrade to the same graceful miss/no-op path an unavailable
 * Redis already takes, never throwing and never hanging past the
 * command timeout.
 */

const originalEnv = { ...process.env };

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function makeReadyClient(overrides: Partial<Record<"get" | "set" | "keys" | "del", any>> = {}) {
  return {
    isReady: true,
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("redis.ts - per-command timeout on an already-ready client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("redis");
    process.env = { ...originalEnv };
  });

  it("getCached() resolves to null (not hung) when redis.get() never settles", async () => {
    const client = makeReadyClient({ get: vi.fn(() => neverResolves()) });
    vi.doMock("redis", () => ({ createClient: () => client }));

    const { getCached } = await import("../redis");

    const promise = getCached("some-key");
    // Advance past the command timeout without advancing past anything
    // that would let the never-resolving get() settle on its own.
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeNull();
  });

  it("setCached() resolves (not hung) when redis.set() never settles", async () => {
    const client = makeReadyClient({ set: vi.fn(() => neverResolves()) });
    vi.doMock("redis", () => ({ createClient: () => client }));

    const { setCached } = await import("../redis");

    const promise = setCached("some-key", { a: 1 }, 60);
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeUndefined();
  });

  it("getCached() still returns the real value promptly when redis answers fast", async () => {
    const client = makeReadyClient({ get: vi.fn().mockResolvedValue(JSON.stringify({ hello: "world" })) });
    vi.doMock("redis", () => ({ createClient: () => client }));

    const { getCached } = await import("../redis");

    const promise = getCached<{ hello: string }>("some-key");
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toEqual({ hello: "world" });
  });

  it("a timed-out get() does not prevent a later, faster call from succeeding (client stays usable)", async () => {
    let callCount = 0;
    const client = makeReadyClient({
      get: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? neverResolves() : Promise.resolve(JSON.stringify({ n: 2 }));
      }),
    });
    vi.doMock("redis", () => ({ createClient: () => client }));

    const { getCached } = await import("../redis");

    const first = getCached("k");
    await vi.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toBeNull();

    const second = getCached<{ n: number }>("k");
    await vi.advanceTimersByTimeAsync(0);
    await expect(second).resolves.toEqual({ n: 2 });
  });
});
