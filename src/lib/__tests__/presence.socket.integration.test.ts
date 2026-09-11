import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as connectClient, type Socket } from "socket.io-client";
import { createMemoryPresenceStore, createPresenceTracker } from "../../../presence";
import { createPresenceState } from "../presence-client";

// End-to-end through real Socket.IO: two "server instances" wired the
// same way server.js wires the presence tracker (connect/disconnect/
// get-status/user-status), two clients driven by the same
// presence-client state PresenceContext uses. Walks the scenario list
// from the bug report: A connects, B asks, A drops, A reconnects, B
// reconnects and re-syncs.

type Inst = { io: Server; port: number; close: () => Promise<void> };
const store = createMemoryPresenceStore();
const remoteEmit: Array<(u: string, s: string) => void> = [];

function startInstance(id: string): Promise<Inst> {
  return new Promise((resolve) => {
    const http = createServer();
    const io = new Server(http, { path: "/api/socket.io" });
    const presence = createPresenceTracker({
      instanceId: id,
      store,
      onChange: (userId, status) => {
        io.emit("user-status", { userId, status });
        // stand-in for the Redis bus: tell the other instance(s)
        for (const fn of remoteEmit) if (fn !== mine) fn(userId, status);
      },
    });
    const mine = (userId: string, status: string) => io.emit("user-status", { userId, status });
    remoteEmit.push(mine);

    io.use((socket, next) => {
      const userId = socket.handshake.auth?.userId;
      if (typeof userId !== "string" || !userId) return next(new Error("Unauthorized"));
      socket.data.userId = userId;
      next();
    });
    io.on("connection", (socket) => {
      const userId = socket.data.userId as string;
      presence.connect(userId);
      socket.on("get-status", async (target: string) => {
        socket.emit("user-status", { userId: target, status: (await presence.isOnline(target)) ? "online" : "offline" });
      });
      socket.on("disconnect", () => {
        presence.disconnect(userId);
      });
    });
    http.listen(0, () => {
      const port = (http.address() as { port: number }).port;
      resolve({
        io,
        port,
        close: () => new Promise((r) => io.close(() => r())),
      });
    });
  });
}

function client(port: number, userId: string): Socket {
  return connectClient(`http://127.0.0.1:${port}`, {
    path: "/api/socket.io",
    transports: ["websocket"],
    auth: { userId },
    reconnection: false,
  });
}
const connected = (s: Socket) => new Promise<void>((r) => (s.connected ? r() : s.once("connect", () => r())));
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe("presence end to end over Socket.IO (two instances)", () => {
  let A: Inst;
  let B: Inst;
  beforeAll(async () => {
    A = await startInstance("A");
    B = await startInstance("B");
  });
  afterAll(async () => {
    await A.close();
    await B.close();
  });

  it("walks the reported scenario: online across instances, offline on drop, online on reconnect, re-sync after viewer reconnect", async () => {
    // Bob (viewer) is on instance B and drives PresenceContext's state.
    const bobState = createPresenceState();
    let bob = client(B.port, "bob");
    const wire = (s: Socket) => {
      s.on("user-status", (p: { userId: string; status: "online" | "offline" }) => bobState.apply(p.userId, p.status));
      s.on("connect", () => { for (const id of bobState.onConnect()) s.emit("get-status", id); });
      s.on("disconnect", () => bobState.onDisconnect());
    };
    wire(bob);
    await connected(bob);

    // 1-2. Alice not connected yet; Bob opens her conversation.
    if (bobState.markRequested("alice", bob.connected)) bob.emit("get-status", "alice");
    await settle();
    expect(bobState.hasStatus("alice")).toBe(true);
    expect(bobState.isOnline("alice")).toBe(false);

    // 3-5. Alice connects - on the OTHER instance - and Bob sees Online.
    const alice = client(A.port, "alice");
    await connected(alice);
    await settle();
    expect(bobState.isOnline("alice")).toBe(true);

    // 6-8. Alice backgrounds/drops completely → Bob sees Offline.
    alice.disconnect();
    await settle();
    expect(bobState.isOnline("alice")).toBe(false);

    // 10. Alice reconnects → Online again.
    const alice2 = client(A.port, "alice");
    await connected(alice2);
    await settle();
    expect(bobState.isOnline("alice")).toBe(true);

    // Second device for Alice, then one drops: still Online (no false offline).
    const aliceTab2 = client(B.port, "alice");
    await connected(aliceTab2);
    aliceTab2.disconnect();
    await settle();
    expect(bobState.isOnline("alice")).toBe(true);

    // The stale-presence case: Bob's own socket drops while Alice goes
    // offline and comes back; Bob must re-sync on reconnect instead of
    // keeping whatever he last heard.
    bob.disconnect();
    await settle();
    expect(bobState.hasStatus("alice")).toBe(false); // unknown while down, never a stale "Offline"
    alice2.disconnect();
    await settle();
    const alice3 = client(A.port, "alice");
    await connected(alice3);
    await settle();
    bob = client(B.port, "bob");
    wire(bob);
    await connected(bob);
    await settle();
    expect(bobState.hasStatus("alice")).toBe(true);
    expect(bobState.isOnline("alice")).toBe(true);

    alice3.disconnect();
    bob.disconnect();
    await settle();
  });

  it("a refused handshake is reported as connect_error with active=false (the case socket-client retries)", async () => {
    const bad = connectClient(`http://127.0.0.1:${A.port}`, { path: "/api/socket.io", transports: ["websocket"], auth: {}, reconnection: false });
    const err = await new Promise<Error>((r) => bad.once("connect_error", (e) => r(e)));
    expect(err.message).toBe("Unauthorized");
    expect(bad.active).toBe(false);
    bad.close();
  });
});
