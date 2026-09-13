import { describe, it, expect } from "vitest";

// Plain require: redis-readiness.js is CommonJS so server.js (a bare
// Node entrypoint) can require it with no build step - see its own
// comment on why. Same pattern as socket-authz.test.ts.
const { isRedisBackedCallsAllowed } = require("../../../redis-readiness.js");

/*
 * Regression coverage for the Redis mixed-fleet split-brain finding:
 * server.js's WebRTC call registry falls back to an in-memory Map when
 * it has no Redis client. In a multi-replica deployment, a replica that
 * fails to connect to Redis at boot while its siblings succeed used to
 * stay silently degraded forever - happily placing calls into a local
 * Map that other replicas could never see, reintroducing exactly the
 * cross-replica call-acceptance bug the Redis-backed registry was built
 * to fix.
 *
 * isRedisBackedCallsAllowed() is the gate: `call-user` only proceeds
 * when it returns true. These tests prove the exact `presenceRedis`
 * shapes server.js can be in, including the one that mattered most:
 * `connectPresenceRedis()`'s bounded-wait race can return a non-null
 * `{pub, sub}` pair whose clients have never actually connected
 * (node-redis's own `connect()` doesn't reject on a refused connection -
 * it just retries forever in the background) - proven by actually
 * booting server.js against an unreachable Redis and observing this
 * exact shape, not assumed.
 */
describe("isRedisBackedCallsAllowed", () => {
  it("allows calls when Redis was never configured at all - uniformly local, not a split-brain risk", () => {
    expect(isRedisBackedCallsAllowed(false, null)).toBe(true);
  });

  it("allows calls when Redis is configured and the client is actually ready", () => {
    const presenceRedis = { pub: { isReady: true }, sub: { isReady: true } };
    expect(isRedisBackedCallsAllowed(true, presenceRedis)).toBe(true);
  });

  it("refuses calls when Redis is configured but presenceRedis is null (a hard connection failure)", () => {
    expect(isRedisBackedCallsAllowed(true, null)).toBe(false);
  });

  it("refuses calls when presenceRedis exists but its client is NOT ready yet - the case that actually matters", () => {
    // This is exactly the shape connectPresenceRedis() returns when
    // Redis is configured but unreachable within its connect window:
    // a real {pub, sub} pair, neither one actually connected.
    const presenceRedis = { pub: { isReady: false }, sub: { isReady: false } };
    expect(isRedisBackedCallsAllowed(true, presenceRedis)).toBe(false);
  });

  it("refuses calls when presenceRedis.pub is missing entirely", () => {
    expect(isRedisBackedCallsAllowed(true, {})).toBe(false);
  });

  it("allows calls again once the same client object transitions to ready (self-heal, no restart)", () => {
    const presenceRedis: { pub: { isReady: boolean } } = { pub: { isReady: false } };
    expect(isRedisBackedCallsAllowed(true, presenceRedis)).toBe(false);

    // node-redis's own reconnectStrategy flips this in the background -
    // no new object, no re-wiring needed for THIS check to reflect it.
    presenceRedis.pub.isReady = true;
    expect(isRedisBackedCallsAllowed(true, presenceRedis)).toBe(true);
  });
});
