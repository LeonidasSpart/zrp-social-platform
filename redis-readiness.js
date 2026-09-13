/*
 * Tiny, pure decision function extracted from server.js so it can be
 * unit-tested directly (server.js's own logic lives entirely inside an
 * `app.prepare().then(async () => {...})` closure and exports nothing -
 * this is the one piece worth pulling out on its own).
 *
 * See server.js's own comment above `callUserAllowed()` for the full
 * story: `presenceRedis` being non-null does NOT mean Redis is actually
 * reachable right now - node-redis's `connect()` doesn't reject on a
 * refused connection, it just keeps retrying forever in the background,
 * so `connectPresenceRedis()`'s bounded-wait race can return a
 * {pub, sub} pair whose clients have never actually connected. `isReady`
 * is node-redis's own live signal for "is a command going to succeed
 * right now" - the same property src/lib/redis.ts already uses for
 * exactly this reason.
 */
function isRedisBackedCallsAllowed(redisConfigured, presenceRedis) {
  if (!redisConfigured) return true;
  return Boolean(presenceRedis && presenceRedis.pub && presenceRedis.pub.isReady);
}

module.exports = { isRedisBackedCallsAllowed };
