import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "redis";
import {
  createPresenceTracker,
  createRedisPresenceBus,
  createRedisPresenceStore,
  type PresenceStatus,
} from "../../../presence";

// Runs against a real local Redis (skips itself when none is reachable)
// and proves the multi-instance path end to end: two "server instances"
// with their own trackers, sharing presence through Redis and relaying
// transitions over pub/sub, exactly as server.js wires them.
const REDIS_URL = process.env.PRESENCE_TEST_REDIS_URL || "redis://127.0.0.1:6379";

async function tryConnect() {
  const c = createClient({ url: REDIS_URL, socket: { connectTimeout: 1500, reconnectStrategy: false } });
  c.on("error", () => {});
  try {
    await c.connect();
    await c.ping();
    return c;
  } catch {
    return null;
  }
}

// No Redis reachable → every case below returns early (reported as
// passed, with a console note) rather than failing; the memory-store
// suite in presence.test.ts still covers the tracker logic.
let available = false;

describe("presence via Redis (integration, real Redis)", () => {
  const prefix = `presence-test:${Date.now()}:`;
  let a: ReturnType<typeof createClient>;
  let aSub: ReturnType<typeof createClient>;
  let b: ReturnType<typeof createClient>;
  let bSub: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const clients = await Promise.all([tryConnect(), tryConnect(), tryConnect(), tryConnect()]);
    if (clients.some((c) => !c)) {
      console.warn(`presence.redis.integration: no Redis at ${REDIS_URL}, skipping`);
      await Promise.all(clients.map((c) => c?.quit()));
      return;
    }
    [a, aSub, b, bSub] = clients as ReturnType<typeof createClient>[];
    available = true;
  });

  afterAll(async () => {
    if (!available) return;
    const keys = await a.keys(`${prefix}*`);
    if (keys.length) await a.del(keys);
    await Promise.all([a.quit(), aSub.quit(), b.quit(), bSub.quit()]);
  });

  it("instance B sees a user connected to instance A, and offline only after the last socket anywhere", async () => {
    if (!available) return;
    const storeA = createRedisPresenceStore(a, { keyPrefix: prefix });
    const storeB = createRedisPresenceStore(b, { keyPrefix: prefix });
    const tA = createPresenceTracker({ instanceId: "A", store: storeA });
    const tB = createPresenceTracker({ instanceId: "B", store: storeB });

    await tA.connect("alice");
    expect(await tB.isOnline("alice")).toBe(true);

    await tB.connect("alice"); // second device on B
    await tA.disconnect("alice");
    expect(await tA.isOnline("alice")).toBe(true); // still on B
    await tB.disconnect("alice");
    expect(await tA.isOnline("alice")).toBe(false);
  });

  it("heartbeat keeps a live instance fresh; a stamp older than the TTL reads as offline", async () => {
    if (!available) return;
    const store = createRedisPresenceStore(a, { keyPrefix: prefix, ttlMs: 2_000 });
    const t = createPresenceTracker({ instanceId: "A", store });
    const reader = createPresenceTracker({ instanceId: "R", store: createRedisPresenceStore(b, { keyPrefix: prefix, ttlMs: 2_000 }) });

    await t.connect("carol");
    expect(await reader.isOnline("carol")).toBe(true);
    // Simulate an instance that died: write an old stamp directly.
    await a.hSet(`${prefix}carol`, "A", String(Date.now() - 10_000));
    expect(await reader.isOnline("carol")).toBe(false);
    // A live instance's heartbeat re-stamps it.
    await t.heartbeat();
    expect(await reader.isOnline("carol")).toBe(true);
    await t.disconnect("carol");
  });

  it("transitions are relayed between instances over pub/sub, ignoring an instance's own messages", async () => {
    if (!available) return;
    const heardOnA: Array<[string, PresenceStatus]> = [];
    const heardOnB: Array<[string, PresenceStatus]> = [];
    const channel = `${prefix}events`;
    const busA = await createRedisPresenceBus(a, aSub, "A", (u, s) => heardOnA.push([u, s]), { channel });
    const busB = await createRedisPresenceBus(b, bSub, "B", (u, s) => heardOnB.push([u, s]), { channel });

    await busA.publish("dave", "online");
    await busB.publish("erin", "offline");
    await new Promise((r) => setTimeout(r, 300));

    expect(heardOnB).toEqual([["dave", "online"]]);
    expect(heardOnA).toEqual([["erin", "offline"]]);
    await busA.close();
    await busB.close();
  });
});
