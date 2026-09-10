import { describe, it, expect, vi } from "vitest";
import {
  createMemoryPresenceStore,
  createPresenceTracker,
  type PresenceStatus,
} from "../../../presence";

// Regression coverage for the private-messaging presence bug: the
// server tracked presence in a per-process Map, so with more than one
// instance a user connected elsewhere read as offline, and a stale
// entry could never expire. The tracker is exercised here through an
// in-memory store shared by several trackers, which is exactly the
// multi-instance topology.

type Change = [string, PresenceStatus];

function tracker(instanceId: string, store: ReturnType<typeof createMemoryPresenceStore> | null) {
  const changes: Change[] = [];
  const t = createPresenceTracker({
    instanceId,
    store,
    onChange: (u, s) => changes.push([u, s]),
    log: { error: vi.fn() },
  });
  return { t, changes };
}

describe("presence tracker - single instance", () => {
  it("online on first socket, offline only after the last socket", async () => {
    const { t, changes } = tracker("i1", null);
    expect(await t.connect("alice")).toBe(true);
    expect(await t.isOnline("alice")).toBe(true);
    expect(await t.connect("alice")).toBe(false); // second tab: no transition
    expect(await t.disconnect("alice")).toBe(false); // one tab closed: still online
    expect(await t.isOnline("alice")).toBe(true);
    expect(await t.disconnect("alice")).toBe(true);
    expect(await t.isOnline("alice")).toBe(false);
    expect(changes).toEqual([["alice", "online"], ["alice", "offline"]]);
  });

  it("reconnect after a full disconnect reports online again", async () => {
    const { t, changes } = tracker("i1", null);
    await t.connect("alice");
    await t.disconnect("alice");
    expect(await t.connect("alice")).toBe(true);
    expect(await t.isOnline("alice")).toBe(true);
    expect(changes).toEqual([["alice", "online"], ["alice", "offline"], ["alice", "online"]]);
  });

  it("an unknown user is offline", async () => {
    const { t } = tracker("i1", null);
    expect(await t.isOnline("nobody")).toBe(false);
  });
});

describe("presence tracker - several server instances sharing a store", () => {
  it("a user connected to another instance is online here (the reported bug)", async () => {
    const store = createMemoryPresenceStore();
    const a = tracker("instance-A", store);
    const b = tracker("instance-B", store);

    await a.t.connect("alice"); // alice's socket lands on instance A
    // Bob, on instance B, opens Alice's conversation and asks.
    expect(await b.t.isOnline("alice")).toBe(true);
    expect(b.t.localCount("alice")).toBe(0);
  });

  it("closing the last socket on one instance does not report offline while another instance still has the user", async () => {
    const store = createMemoryPresenceStore();
    const a = tracker("instance-A", store);
    const b = tracker("instance-B", store);

    await a.t.connect("alice"); // phone on A
    expect(await b.t.connect("alice")).toBe(false); // laptop on B: already online globally, no duplicate "online"
    expect(await a.t.disconnect("alice")).toBe(false); // phone drops: still online via B
    expect(await b.t.isOnline("alice")).toBe(true);
    expect(await a.t.isOnline("alice")).toBe(true);
    expect(await b.t.disconnect("alice")).toBe(true); // laptop drops: now really offline
    expect(await a.t.isOnline("alice")).toBe(false);
    expect(a.changes).toEqual([["alice", "online"]]);
    expect(b.changes).toEqual([["alice", "offline"]]);
  });

  it("a dead instance's entry goes stale after the TTL, a live one is kept alive by the heartbeat", async () => {
    let now = 1_000_000;
    const store = createMemoryPresenceStore({ ttlMs: 90_000, now: () => now });
    const dead = tracker("instance-dead", store);
    const live = tracker("instance-live", store);
    const reader = tracker("instance-reader", store);

    await dead.t.connect("alice");
    await live.t.connect("bob");
    expect(await reader.t.isOnline("alice")).toBe(true);
    expect(await reader.t.isOnline("bob")).toBe(true);

    // 60s pass; only the live instance heartbeats.
    now += 60_000;
    await live.t.heartbeat();
    // 45s more: alice's stamp is 105s old (> TTL), bob's is 45s old.
    now += 45_000;
    expect(await reader.t.isOnline("alice")).toBe(false);
    expect(await reader.t.isOnline("bob")).toBe(true);
  });

  it("a socket that connects and disconnects while the store call is in flight leaves no phantom online", async () => {
    // Production logs show exactly this traffic: the same user's socket
    // connecting and disconnecting again within milliseconds, and 2-3
    // concurrent sockets per user. With a store that takes real time,
    // an unserialised tracker could leave the user marked online with
    // no socket at all, or report a spurious offline.
    const base = createMemoryPresenceStore();
    const slow = <T extends unknown[], R>(fn: (...a: T) => Promise<R>) => async (...a: T) => {
      await new Promise((r) => setTimeout(r, 25));
      return fn(...a);
    };
    const store = {
      ttlMs: base.ttlMs,
      setOnline: slow(base.setOnline.bind(base)),
      setOffline: slow(base.setOffline.bind(base)),
      refresh: slow(base.refresh.bind(base)),
      isOnline: slow(base.isOnline.bind(base)),
    };
    const { t, changes } = tracker("i1", store);

    // Fire both without awaiting the first - the exact interleaving.
    await Promise.all([t.connect("alice"), t.disconnect("alice")]);
    expect(t.localCount("alice")).toBe(0);
    expect(await t.isOnline("alice")).toBe(false);
    expect(changes).toEqual([["alice", "online"], ["alice", "offline"]]);

    // A burst of overlapping connects/disconnects still settles exactly.
    const { t: t2 } = tracker("i2", store);
    await Promise.all([
      t2.connect("bob"),
      t2.connect("bob"),
      t2.disconnect("bob"),
      t2.connect("bob"),
      t2.disconnect("bob"),
    ]);
    expect(t2.localCount("bob")).toBe(1);
    expect(await t2.isOnline("bob")).toBe(true);
    await t2.disconnect("bob");
    expect(await t2.isOnline("bob")).toBe(false);
  });

  it("a store failure falls back to local knowledge and never throws", async () => {
    const broken = {
      ttlMs: 90_000,
      setOnline: async () => { throw new Error("redis down"); },
      setOffline: async () => { throw new Error("redis down"); },
      refresh: async () => { throw new Error("redis down"); },
      isOnline: async () => { throw new Error("redis down"); },
    };
    const log = { error: vi.fn() };
    const t = createPresenceTracker({ instanceId: "i1", store: broken, log });
    await expect(t.connect("alice")).resolves.toBe(true);
    expect(await t.isOnline("alice")).toBe(true); // local count still authoritative
    await expect(t.heartbeat()).resolves.toBeUndefined();
    await expect(t.disconnect("alice")).resolves.toBe(true);
    expect(await t.isOnline("alice")).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});
