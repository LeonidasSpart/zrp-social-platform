import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { createPresenceTracker, createRedisPresenceStore } from "../../../presence";

/*
 * Proves the exact fix in server.js: before this, there was no
 * @socket.io/redis-adapter (or any adapter) wired in at all, so
 * io.to()/socket.to()/io.emit() only ever reached sockets connected to
 * the SAME process - invisible with Railway's current single replica,
 * but every cross-user relay (messages, typing, reactions, calls,
 * presence) would have silently gone nowhere the moment a second
 * instance existed. This spins up two REAL Socket.IO servers on two
 * real ports, each with its own real Redis pub/sub pair (mirroring two
 * independent Railway replicas, each independently calling
 * connectPresenceRedis()), and proves messages placed on one are
 * delivered to a client connected to the other via a REAL local Redis -
 * not a mock, not an in-process stand-in.
 *
 * Also proves the fix for the bug this change would otherwise have
 * introduced: presence's old manual pub/sub relay (createRedisPresenceBus)
 * called io.emit() on the *receiving* instance on top of the adapter's
 * own cross-instance io.emit() propagation, which would double-deliver
 * every "user-status" transition once the adapter was added. That relay
 * is gone; this test confirms a transition is now received exactly once
 * on the other instance.
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

type Inst = { io: Server; port: number; presence: ReturnType<typeof createPresenceTracker>; close: () => Promise<void> };

const STORE_KEY_PREFIX = `socket-adapter-test:${Date.now()}:`;

async function startInstance(
  id: string,
  pub: ReturnType<typeof createClient>,
  sub: ReturnType<typeof createClient>
): Promise<Inst> {
  const http: HttpServer = createServer();
  const io = new Server(http, { path: "/api/socket.io" });
  // The exact call server.js makes.
  io.adapter(createAdapter(pub, sub));

  // Same prefix on both instances - it's one shared Redis hash per
  // userId (each instance writes its own field), exactly like
  // server.js's two real replicas would both point at the same
  // "presence:<userId>" key.
  const store = createRedisPresenceStore(pub, { keyPrefix: STORE_KEY_PREFIX });
  const presence = createPresenceTracker({
    instanceId: id,
    store,
    onChange: (userId, status) => {
      io.emit("user-status", { userId, status });
    },
  });

  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (typeof userId !== "string" || !userId) return next(new Error("Unauthorized"));
    socket.data.userId = userId;
    next();
  });
  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userId);
    presence.connect(userId);
    socket.on("disconnect", () => presence.disconnect(userId));
  });

  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as { port: number }).port;
  return {
    io,
    port,
    presence,
    close: () => new Promise((r) => io.close(() => r())),
  };
}

function client(port: number, userId: string): ClientSocket {
  return connectClient(`http://127.0.0.1:${port}`, {
    path: "/api/socket.io",
    transports: ["websocket"],
    auth: { userId },
    reconnection: false,
  });
}
const connected = (s: ClientSocket) => new Promise<void>((r) => (s.connected ? r() : s.once("connect", () => r())));
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

let available = false;
let redisClients: Array<ReturnType<typeof createClient>> = [];

describe("Socket.IO Redis adapter - real cross-instance delivery (integration, real Redis)", () => {
  let A: Inst;
  let B: Inst;

  beforeAll(async () => {
    const clients = await Promise.all([tryConnect(), tryConnect(), tryConnect(), tryConnect()]);
    if (clients.some((c) => !c)) {
      console.warn(`socket-redis-adapter.integration: no Redis at ${REDIS_URL}, skipping`);
      await Promise.all(clients.map((c) => c?.quit()));
      return;
    }
    redisClients = clients as Array<ReturnType<typeof createClient>>;
    const [pubA, subA, pubB, subB] = redisClients;
    A = await startInstance("A", pubA, subA);
    B = await startInstance("B", pubB, subB);
    available = true;
  });

  afterAll(async () => {
    if (!available) return;
    await A.close();
    await B.close();
    const keys = await redisClients[0].keys(`${STORE_KEY_PREFIX}*`);
    if (keys.length) await redisClients[0].del(keys);
    await Promise.all(redisClients.map((c) => c.quit()));
  });

  it("a message emitted via io.to(userId).emit() on instance A reaches a client connected only to instance B", async () => {
    if (!available) return;
    const bob = client(B.port, "bob"); // connected to a DIFFERENT process than the emit below
    await connected(bob);

    const received = new Promise((resolve) => bob.once("receive-message", resolve));
    // Exactly the pattern send-message/send-group-message/call-user use:
    // io.to(<verified room>).emit(...) from whichever instance handled
    // the originating socket event.
    A.io.to("bob").emit("receive-message", { text: "hello from instance A" });

    await expect(received).resolves.toEqual({ text: "hello from instance A" });
    bob.close();
  });

  it("a presence transition on instance A reaches instance B's client exactly once (no duplicate from the old manual relay)", async () => {
    if (!available) return;
    const carol = client(B.port, "carol");
    await connected(carol);

    const events: Array<{ userId: string; status: string }> = [];
    carol.on("user-status", (p) => events.push(p));

    const dave = client(A.port, "dave"); // connects on instance A - presence.connect() fires onChange there
    await connected(dave);
    await settle();

    const daveEvents = events.filter((e) => e.userId === "dave" && e.status === "online");
    expect(daveEvents).toHaveLength(1); // not 2 - see the module comment above

    dave.close();
    carol.close();
  });

  it("isOnline() on instance B sees a user connected only to instance A (the Redis-backed store, unaffected by the adapter change)", async () => {
    if (!available) return;
    const erin = client(A.port, "erin");
    await connected(erin);
    await settle();

    expect(await B.presence.isOnline("erin")).toBe(true);

    erin.close();
    await settle();
    expect(await B.presence.isOnline("erin")).toBe(false);
  });
});
