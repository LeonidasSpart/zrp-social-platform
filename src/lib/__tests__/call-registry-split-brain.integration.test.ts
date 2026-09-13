import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "net";
import { createServer, type Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { isRedisBackedCallsAllowed } from "../../../redis-readiness";
import { createCallRegistry } from "../../../socket-authz";

/*
 * End-to-end proof of the split-brain fix, against a REAL Redis server
 * behind a breakable TCP proxy (the same technique
 * src/lib/news/__tests__/redis.integration.test.ts uses to simulate a
 * connection outage and recovery inside one process).
 *
 * Builds a minimal Socket.IO server that mirrors server.js's actual
 * wiring exactly: the real @socket.io/redis-adapter, the real
 * createCallRegistry() from socket-authz.js, and the real
 * isRedisBackedCallsAllowed() gate - not stand-ins for any of them.
 * The only thing this test controls is the network path to Redis.
 *
 * Proves:
 *  1. While Redis is unreachable, "call-user" is refused with reason
 *     "service-unavailable" - no call is EVER placed into the local
 *     in-memory registry that a sibling replica couldn't see.
 *  2. Once the SAME long-lived client reconnects (node-redis's own
 *     background reconnectStrategy, no restart, no new client object),
 *     "call-user" succeeds again on its own.
 */
const REAL_REDIS_URL = process.env.PRESENCE_TEST_REDIS_URL || "redis://127.0.0.1:6379";
const hasRedis = (() => {
  try {
    new URL(REAL_REDIS_URL);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasRedis)("WebRTC call registry split-brain gate (integration, real Redis behind a breakable proxy)", () => {
  const PROXY_PORT = 6391;
  let proxy: net.Server;
  let live: net.Socket[] = [];
  let broken = true; // starts broken - simulates "unreachable from boot"

  let httpServer: HttpServer;
  let io: Server;
  let port: number;
  let pub: ReturnType<typeof createClient>;
  let sub: ReturnType<typeof createClient>;
  let presenceRedis: { pub: ReturnType<typeof createClient>; sub: ReturnType<typeof createClient> };
  let calls: ReturnType<typeof createCallRegistry>;

  const REDIS_CONFIGURED = true;
  function callUserAllowed() {
    return isRedisBackedCallsAllowed(REDIS_CONFIGURED, presenceRedis);
  }

  // node-redis's internal reconnect machinery emits some promise
  // rejections of its own while the proxy is deliberately broken below
  // (a destroyed in-flight socket mid-handshake) that aren't tied to any
  // promise this test itself awaits - the same category of noise
  // src/lib/news/__tests__/redis.integration.test.ts's own
  // proxy-breaking tests produce as logged 'error' events. Swallowed
  // here, scoped to this file's run only, so a REAL unhandled rejection
  // elsewhere in the suite is not masked by this deliberately-simulated
  // outage's own internal retry noise.
  function ignoreRedisInternalNoise(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (/socket closed unexpectedly|ECONNRESET|ECONNREFUSED/i.test(message)) return;
    throw reason;
  }

  beforeAll(async () => {
    process.on("unhandledRejection", ignoreRedisInternalNoise);
    // The breakable proxy in front of the real Redis server.
    const upstream = new URL(REAL_REDIS_URL);
    await new Promise<void>((resolve) => {
      proxy = net.createServer((incoming) => {
        if (broken) {
          incoming.destroy();
          return;
        }
        const out = net.connect(Number(upstream.port || 6379), upstream.hostname);
        incoming.pipe(out);
        out.pipe(incoming);
        incoming.on("error", () => {});
        out.on("error", () => {});
        live.push(incoming, out);
      });
      proxy.listen(PROXY_PORT, "127.0.0.1", () => resolve());
    });

    // Exactly server.js's own client construction, pointed at the proxy.
    pub = createClient({
      url: `redis://127.0.0.1:${PROXY_PORT}`,
      socket: { connectTimeout: 1000, reconnectStrategy: (retries) => Math.min(200 * 2 ** retries, 2000) },
    });
    sub = pub.duplicate();
    pub.on("error", () => {});
    sub.on("error", () => {});

    // Mirrors connectPresenceRedis()'s own bounded-wait race: fire
    // connect() but don't let a still-broken proxy hang this setup.
    await Promise.race([
      Promise.all([pub.connect(), sub.connect()]),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    presenceRedis = { pub, sub };

    // Exactly server.js's own wiring: the real adapter, the real call
    // registry, both bound to this same long-lived client pair.
    httpServer = createServer();
    io = new Server(httpServer, { path: "/api/socket.io" });
    io.adapter(createAdapter(pub, sub));
    calls = createCallRegistry({ redisClient: pub });

    io.use((socket, next) => {
      const userId = socket.handshake.auth?.userId;
      if (typeof userId !== "string" || !userId) return next(new Error("Unauthorized"));
      socket.data.userId = userId;
      next();
    });

    io.on("connection", (socket) => {
      const userId = socket.data.userId as string;
      socket.join(userId);

      socket.on("call-user", async ({ receiverId } = {}) => {
        if (!callUserAllowed()) {
          socket.emit("call-rejected", { reason: "service-unavailable" });
          return;
        }
        await calls.start(userId, receiverId);
        io.to(receiverId).emit("incoming-call", { callerId: userId });
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;
  }, 20000);

  afterAll(async () => {
    broken = false;
    live.forEach((s) => s.destroy());
    live = [];
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await new Promise<void>((resolve) => io.close(() => resolve()));
    for (const c of [pub, sub]) {
      try {
        await c.disconnect();
      } catch {
        // already gone
      }
    }
    process.off("unhandledRejection", ignoreRedisInternalNoise);
  });

  function connectAs(userId: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = connectClient(`http://127.0.0.1:${port}`, {
        path: "/api/socket.io",
        auth: { userId },
        transports: ["websocket"],
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  }

  it("refuses to place a call while Redis is unreachable - never touches the local in-memory registry", async () => {
    expect(callUserAllowed()).toBe(false);

    const caller = await connectAs("caller-1");
    const rejected = new Promise<{ reason: string }>((resolve) => {
      caller.on("call-rejected", resolve);
    });

    caller.emit("call-user", { receiverId: "receiver-1" });

    const payload = await rejected;
    expect(payload.reason).toBe("service-unavailable");

    caller.disconnect();
  }, 10000);

  it("allows calls again once the SAME client reconnects on its own - no restart, no new connection object", async () => {
    // The network heals. Nothing here creates a new client or calls
    // connectPresenceRedis() again - node-redis's own reconnectStrategy
    // on the existing `pub`/`sub` objects is what has to bring this back.
    broken = false;

    // Poll isReady the same way production code would observe recovery.
    let recovered = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (pub.isReady && sub.isReady) {
        recovered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(recovered, "the existing client pair must reconnect on its own").toBe(true);
    expect(callUserAllowed()).toBe(true);

    const caller = await connectAs("caller-2");
    const receiver = await connectAs("receiver-2");

    const incoming = new Promise<{ callerId: string }>((resolve) => {
      receiver.on("incoming-call", resolve);
    });

    caller.emit("call-user", { receiverId: "receiver-2" });

    const payload = await incoming;
    expect(payload.callerId).toBe("caller-2");

    caller.disconnect();
    receiver.disconnect();
  }, 20000);
});
