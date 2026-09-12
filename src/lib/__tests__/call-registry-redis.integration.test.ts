import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "redis";
const authz = require("../../../socket-authz");

/*
 * Proves the fix for the highest-priority finding in the final closure
 * pass: server.js's WebRTC call registry (socket-authz.js's
 * createCallRegistry) used to be an in-memory Map, invisible across
 * Railway replicas. The Socket.IO Redis adapter (PR #302) distributes
 * *events* - it does not distribute *this* application state. On two
 * replicas, `call-user` on the replica the caller is connected to would
 * leave the replica the callee is connected to with no record of the
 * call at all, so `accept-call` there would silently return false and
 * the call would never connect - invisible on today's single replica,
 * live the moment a second one exists.
 *
 * This uses two SEPARATE real Redis client connections (mirroring two
 * independent Railway replicas, each calling connectPresenceRedis() on
 * its own) against the SAME real local Redis server, and two separate
 * createCallRegistry() instances - one per "replica" - to prove state
 * written on one is correctly readable and mutable from the other. The
 * actual cross-instance *event delivery* guarantee (io.to()/io.emit()
 * reaching another replica's sockets) is already proven separately by
 * socket-redis-adapter.integration.test.ts; what this proves is the
 * layer that test cannot reach - whether the call STATE those events
 * refer to is itself shared, not just the transport.
 */
const REDIS_URL = process.env.PRESENCE_TEST_REDIS_URL || "redis://127.0.0.1:6379";

async function tryConnect() {
  const c = createClient({ url: REDIS_URL, socket: { connectTimeout: 1500, reconnectStrategy: false } });
  c.on("error", () => {});
  try {
    await c.connect();
    return c;
  } catch {
    return null;
  }
}

let available = false;
let replicaAClient: ReturnType<typeof createClient> | null = null;
let replicaBClient: ReturnType<typeof createClient> | null = null;

describe("WebRTC call registry - multi-instance (real Redis, two connections)", () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([tryConnect(), tryConnect()]);
    if (!a || !b) {
      console.warn(`call-registry-redis.integration: no Redis at ${REDIS_URL}, skipping`);
      await Promise.all([a?.quit(), b?.quit()]);
      return;
    }
    replicaAClient = a;
    replicaBClient = b;
    available = true;
  }, 15_000);

  afterAll(async () => {
    if (!available) return;
    await Promise.allSettled([replicaAClient?.quit(), replicaBClient?.quit()]);
  });

  function registries() {
    // Fresh registry objects per test, sharing the two real connections -
    // each createCallRegistry() call mirrors one Railway replica's own
    // server.js booting up and building its own registry, all pointed at
    // the same Redis, exactly as server.js's real construction does.
    const replicaA = authz.createCallRegistry({ redisClient: replicaAClient });
    const replicaB = authz.createCallRegistry({ redisClient: replicaBClient });
    return { replicaA, replicaB };
  }

  it("START on replica A -> ACCEPT on replica B -> END on replica A, all correctly authorized", async () => {
    if (!available) return;
    const { replicaA, replicaB } = registries();
    const alice = `alice-${Date.now()}`;
    const bob = `bob-${Date.now()}`;

    // Caller's socket is on replica A.
    await replicaA.start(alice, bob);

    // Callee's socket is on replica B - replica B has never called
    // start() itself, yet must see the call alice placed on replica A.
    expect(await replicaB.accept(bob, alice)).toBe(true);
    // Replaying the same accept (e.g. a duplicate client event) must not
    // succeed a second time - it's no longer pending.
    expect(await replicaB.accept(bob, alice)).toBe(false);

    // The caller ending the call from replica A must see replica B's
    // "active" state, not a stale "pending"/non-existent view.
    expect(await replicaA.end(alice, bob)).toBe(true);
    // Idempotent: already gone.
    expect(await replicaB.end(bob, alice)).toBe(false);
  });

  it("START on replica A -> REJECT on replica B", async () => {
    if (!available) return;
    const { replicaA, replicaB } = registries();
    const alice = `alice-reject-${Date.now()}`;
    const bob = `bob-reject-${Date.now()}`;

    await replicaA.start(alice, bob);
    // The caller cannot "reject" their own call, from either replica.
    expect(await replicaA.reject(alice, bob)).toBe(false);
    expect(await replicaB.reject(bob, alice)).toBe(true);
    // The call is really gone - replica A can't act on it either.
    expect(await replicaA.end(alice, bob)).toBe(false);
  });

  it("START on replica A -> the callee's replica B disconnects (dropUser) -> nothing left to accept anywhere", async () => {
    if (!available) return;
    const { replicaA, replicaB } = registries();
    const alice = `alice-drop-${Date.now()}`;
    const bob = `bob-drop-${Date.now()}`;
    const carol = `carol-drop-${Date.now()}`;
    const dave = `dave-drop-${Date.now()}`;

    await replicaA.start(alice, bob);
    await replicaB.start(carol, dave); // an unrelated, concurrent call on the other replica

    // Bob's last socket disconnects - handled on whichever replica his
    // disconnect event fires on (replica B here), which never itself
    // called start() for this call.
    await replicaB.dropUser(bob);

    // The dropped user's call is gone, reachable from either replica.
    expect(await replicaA.accept(bob, alice)).toBe(false);
    expect(await replicaB.accept(bob, alice)).toBe(false);

    // The unrelated concurrent call between carol/dave must be untouched.
    expect(await replicaA.accept(dave, carol)).toBe(true);
  });

  it("a call started on replica A is invisible to a DIFFERENT, unrelated pair - no cross-talk", async () => {
    if (!available) return;
    const { replicaA, replicaB } = registries();
    const alice = `alice-iso-${Date.now()}`;
    const bob = `bob-iso-${Date.now()}`;
    const mallory = `mallory-iso-${Date.now()}`;

    await replicaA.start(alice, bob);
    // Mallory was never called and never placed a call - accepting
    // "from" alice while claiming to be bob's counterpart under a
    // different identity must fail on whichever replica handles it.
    expect(await replicaB.accept(mallory, alice)).toBe(false);
    // The real callee, on the real replica, still can.
    expect(await replicaB.accept(bob, alice)).toBe(true);
  });

  it("an expired pending call (short TTL) cannot be accepted from either replica", async () => {
    if (!available) return;
    const replicaA = authz.createCallRegistry({ redisClient: replicaAClient, pendingTtlMs: 50 });
    const replicaB = authz.createCallRegistry({ redisClient: replicaBClient, pendingTtlMs: 50 });
    const alice = `alice-ttl-${Date.now()}`;
    const bob = `bob-ttl-${Date.now()}`;

    await replicaA.start(alice, bob);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await replicaB.accept(bob, alice)).toBe(false);
  });
});
