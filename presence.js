/*
 * Online presence tracker for the Socket.IO server (CommonJS - required
 * by server.js, the bare Node entrypoint). Unit-tested from
 * src/lib/__tests__/presence.test.ts through an in-memory store and
 * against a real Redis in presence.redis.integration.test.ts.
 *
 * Why this exists: server.js kept presence in a plain per-process Map
 * (`userStatus`). That is only correct while exactly one server process
 * ever exists. With more than one instance, a user connected to
 * instance A is "offline" as far as instance B knows - B's `get-status`
 * answers from its own Map and never hears A's `user-status` broadcast,
 * which `socket.broadcast.emit` only delivers to A's own sockets. The
 * conversation header then shows "Offline" for someone who is actively
 * chatting. The same Map also had no notion of staleness: a crashed
 * instance could never clean up its entries.
 *
 * This tracker keeps the per-process count of live sockets per user
 * (that stays authoritative for THIS instance: a socket is online
 * exactly until Socket.IO's own heartbeat declares it dead), and
 * optionally shares it through a store so every instance sees every
 * user:
 *
 *   store hash  presence:<userId>  { <instanceId>: <lastSeenMs>, ... }
 *
 * An instance writes its own field when a user's first socket connects,
 * refreshes every field it owns on a heartbeat, and removes its field
 * when the user's last socket on it disconnects. A field older than
 * `ttlMs` is ignored, so an instance that died without cleaning up
 * cannot leave a user "online" forever - the key itself also expires.
 *
 * "online"/"offline" transitions are reported through `onChange` only
 * when the user's GLOBAL state actually changed - a user closing a tab
 * on instance A while still connected on instance B produces no
 * "offline". Instances relay each other's transitions over a pub/sub
 * bus (createRedisPresenceBus) so every client hears them.
 *
 * Without a store (no REDIS_URL, or Redis unreachable) everything
 * degrades to exactly the previous single-process behaviour; nothing
 * here can crash the server or block a socket.
 */

const DEFAULT_TTL_MS = 90 * 1000;

function createMemoryPresenceStore(options) {
  // Shared by every tracker created against it - used by tests to
  // simulate several server instances.
  const ttlMs = (options && options.ttlMs) || DEFAULT_TTL_MS;
  const now = (options && options.now) || (() => Date.now());
  const hashes = new Map(); // userId -> Map<instanceId, lastSeenMs>

  return {
    ttlMs,
    async setOnline(userId, instanceId) {
      let h = hashes.get(userId);
      if (!h) {
        h = new Map();
        hashes.set(userId, h);
      }
      h.set(instanceId, now());
    },
    async setOffline(userId, instanceId) {
      const h = hashes.get(userId);
      if (!h) return;
      h.delete(instanceId);
      if (h.size === 0) hashes.delete(userId);
    },
    async refresh(instanceId, userIds) {
      for (const userId of userIds) await this.setOnline(userId, instanceId);
    },
    async isOnline(userId) {
      const h = hashes.get(userId);
      if (!h) return false;
      const cutoff = now() - ttlMs;
      for (const seen of h.values()) if (seen >= cutoff) return true;
      return false;
    },
  };
}

/**
 * Redis-backed store. `client` is a connected node-redis v4 client (or
 * one that may not be ready yet - every call checks `isReady` and
 * throws a recognisable error when it is not, which the tracker turns
 * into "treat as unknown, fall back to local").
 */
function createRedisPresenceStore(client, options) {
  const ttlMs = (options && options.ttlMs) || DEFAULT_TTL_MS;
  const keyPrefix = (options && options.keyPrefix) || "presence:";
  const ttlSeconds = Math.ceil(ttlMs / 1000);
  const key = (userId) => `${keyPrefix}${userId}`;

  function ready() {
    if (!client || client.isReady === false) throw new Error("presence store not ready");
  }

  return {
    ttlMs,
    async setOnline(userId, instanceId) {
      ready();
      const multi = client.multi();
      multi.hSet(key(userId), instanceId, String(Date.now()));
      multi.expire(key(userId), ttlSeconds);
      await multi.exec();
    },
    async setOffline(userId, instanceId) {
      ready();
      await client.hDel(key(userId), instanceId);
    },
    async refresh(instanceId, userIds) {
      if (userIds.length === 0) return;
      ready();
      const stamp = String(Date.now());
      const multi = client.multi();
      for (const userId of userIds) {
        multi.hSet(key(userId), instanceId, stamp);
        multi.expire(key(userId), ttlSeconds);
      }
      await multi.exec();
    },
    async isOnline(userId) {
      ready();
      const fields = await client.hGetAll(key(userId));
      const cutoff = Date.now() - ttlMs;
      for (const value of Object.values(fields || {})) {
        const seen = Number(value);
        if (Number.isFinite(seen) && seen >= cutoff) return true;
      }
      return false;
    },
  };
}

function createPresenceTracker(options) {
  const instanceId = (options && options.instanceId) || `inst-${process.pid}`;
  const store = (options && options.store) || null;
  const onChange = (options && options.onChange) || (() => {});
  const log = (options && options.log) || console;
  const local = new Map(); // userId -> live socket count on THIS instance

  /*
   * ⚠️ connect()/disconnect() both await the store, so two operations
   * for the SAME user can interleave - and production logs show exactly
   * that traffic: a socket connecting and disconnecting again within
   * milliseconds, and 2-3 concurrent sockets per user. Interleaved,
   * disconnect could observe a local count the in-flight connect had
   * not incremented yet (spurious "offline"), or connect's setOnline
   * could land AFTER disconnect's setOffline and leave the user marked
   * online in the shared store with no socket at all - a phantom
   * "Online" until the TTL expired.
   *
   * Per-user operations are therefore serialised through a promise
   * chain: for any one user they run strictly in arrival order, so the
   * store always ends in the state the last event implies. Different
   * users never wait on each other. The chain entry is dropped once it
   * drains, so this cannot grow without bound.
   */
  const chains = new Map(); // userId -> Promise (in-flight op chain)
  function serialize(userId, fn) {
    const previous = chains.get(userId) || Promise.resolve();
    const run = previous.then(fn, fn);
    const tracked = run.catch(() => {});
    chains.set(userId, tracked);
    tracked.then(() => {
      if (chains.get(userId) === tracked) chains.delete(userId);
    });
    return run;
  }

  let lastStoreErrorAt = 0;
  function storeFailed(err) {
    // One log line per minute at most - a Redis outage must not turn
    // into a log flood, and must not affect the sockets themselves.
    const now = Date.now();
    if (now - lastStoreErrorAt > 60_000) {
      lastStoreErrorAt = now;
      log.error("presence store unavailable (falling back to local presence):", err instanceof Error ? err.message : err);
    }
  }

  async function globallyOnline(userId) {
    if ((local.get(userId) || 0) > 0) return true;
    if (!store) return false;
    try {
      return await store.isOnline(userId);
    } catch (err) {
      storeFailed(err);
      return false;
    }
  }

  return {
    instanceId,

    /** A socket for `userId` connected. Resolves after the transition (if any) was reported. */
    connect(userId) {
      return serialize(userId, async () => {
        // Counted synchronously, before any await, so a disconnect that
        // arrives while the store call is in flight sees this socket.
        const before = local.get(userId) || 0;
        local.set(userId, before + 1);

        let wasOnline = before > 0;
        if (!wasOnline && store) {
          try {
            wasOnline = await store.isOnline(userId);
          } catch (err) {
            storeFailed(err);
          }
        }
        if (store) {
          try {
            await store.setOnline(userId, instanceId);
          } catch (err) {
            storeFailed(err);
          }
        }
        if (!wasOnline) onChange(userId, "online");
        return !wasOnline;
      });
    },

    /** A socket for `userId` disconnected. */
    disconnect(userId) {
      return serialize(userId, async () => {
        const remaining = (local.get(userId) || 1) - 1;
        if (remaining > 0) {
          local.set(userId, remaining);
          return false;
        }
        local.delete(userId);
        if (store) {
          try {
            await store.setOffline(userId, instanceId);
          } catch (err) {
            storeFailed(err);
          }
        }
        const stillOnline = await globallyOnline(userId);
        if (!stillOnline) onChange(userId, "offline");
        return !stillOnline;
      });
    },

    /** Authoritative answer for get-status: this instance, then the shared store. */
    async isOnline(userId) {
      return globallyOnline(userId);
    },

    /** Re-stamp every user this instance holds so a live instance never goes stale. */
    async heartbeat() {
      if (!store) return;
      const userIds = Array.from(local.keys());
      try {
        await store.refresh(instanceId, userIds);
      } catch (err) {
        storeFailed(err);
      }
    },

    localUserIds() {
      return Array.from(local.keys());
    },
    localCount(userId) {
      return local.get(userId) || 0;
    },
  };
}

/**
 * Cross-instance relay of presence transitions. `pub` and `sub` are two
 * node-redis clients (a subscriber connection can do nothing else).
 * Messages from this instance itself are ignored on receipt - the local
 * emit already happened in onChange.
 */
async function createRedisPresenceBus(pub, sub, instanceId, onRemote, options) {
  const channel = (options && options.channel) || "presence:events";
  await sub.subscribe(channel, (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg || msg.instanceId === instanceId) return;
      if (typeof msg.userId !== "string" || (msg.status !== "online" && msg.status !== "offline")) return;
      onRemote(msg.userId, msg.status);
    } catch {
      // ignore malformed messages
    }
  });
  return {
    async publish(userId, status) {
      if (!pub || pub.isReady === false) return;
      try {
        await pub.publish(channel, JSON.stringify({ instanceId, userId, status }));
      } catch {
        // best effort - the local emit has already happened
      }
    },
    async close() {
      try {
        await sub.unsubscribe(channel);
      } catch {
        // ignore
      }
    },
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  createMemoryPresenceStore,
  createRedisPresenceStore,
  createPresenceTracker,
  createRedisPresenceBus,
};
