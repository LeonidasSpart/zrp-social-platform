import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as connectClient, type Socket } from "socket.io-client";
import { createMemoryPresenceStore, createPresenceTracker } from "../../../presence";

// End-to-end through real Socket.IO, wired the way server.js wires
// `call-user`: presence tracker, a caller and a receiver, and the
// online-check that decides whether the call rings or is refused
// immediately.
//
// The bug this covers: `io.to(receiverId).emit("incoming-call", ...)`
// into an empty room succeeds silently. The event goes nowhere, nothing
// ever answers, and the caller's UI - which sets state "calling" and has
// no timeout of any kind - rings until the person gives up and reloads.
// That was true for ANY unreachable recipient: a logged-out user, a
// backgrounded app, a dropped connection, or a client with no call
// support at all.
//
// These tests assert the caller is always released, and - just as
// importantly - that a reachable receiver still rings, so the fix cannot
// regress into refusing calls that would have worked.

type Inst = { io: Server; port: number; close: () => Promise<void> };

const open: Socket[] = [];
const servers: Inst[] = [];

function startInstance(): Promise<Inst> {
  return new Promise((resolve) => {
    const http = createServer();
    const io = new Server(http, { path: "/api/socket.io" });
    const presence = createPresenceTracker({
      instanceId: "test",
      store: createMemoryPresenceStore(),
      onChange: () => {},
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
      presence.connect(userId).catch(() => {});

      // The same shape as server.js's handler, minus the parts this test
      // is not about (rate limit, block check, caller name lookup).
      socket.on("call-user", async ({ receiverId }: { receiverId?: string } = {}) => {
        if (!receiverId || typeof receiverId !== "string" || receiverId === userId) return;

        let receiverOnline = true;
        try {
          receiverOnline = await presence.isOnline(receiverId);
        } catch {
          receiverOnline = true;
        }
        if (!receiverOnline) {
          socket.emit("call-rejected", { reason: "unavailable" });
          return;
        }

        io.to(receiverId).emit("incoming-call", { callerId: userId, callerName: userId });
      });

      socket.on("disconnect", () => {
        presence.disconnect(userId).catch(() => {});
      });
    });

    http.listen(0, () => {
      const port = (http.address() as { port: number }).port;
      const inst: Inst = {
        io,
        port,
        close: () =>
          new Promise((done) => {
            io.close(() => http.close(() => done()));
          }),
      };
      servers.push(inst);
      resolve(inst);
    });
  });
}

function connect(port: number, userId: string): Promise<Socket> {
  return new Promise((resolve) => {
    const s = connectClient(`http://localhost:${port}`, {
      path: "/api/socket.io",
      auth: { userId },
      transports: ["websocket"],
    });
    open.push(s);
    s.on("connect", () => resolve(s));
  });
}

/** Resolves with the event payload, or `null` if it never arrives. */
function waitFor(socket: Socket, event: string, ms = 600): Promise<unknown | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    const handler = (payload: unknown) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload ?? {});
    };
    socket.on(event, handler);
  });
}

afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  for (const s of servers.splice(0)) await s.close();
});

describe("call-user against an unreachable receiver", () => {
  it("releases the caller immediately instead of ringing into an empty room", async () => {
    const inst = await startInstance();
    const caller = await connect(inst.port, "caller-1");

    // "receiver-1" has never connected: io.to() would reach nobody.
    caller.emit("call-user", { receiverId: "receiver-1" });

    const rejected = (await waitFor(caller, "call-rejected")) as { reason?: string } | null;
    expect(rejected).not.toBeNull();
    expect(rejected?.reason).toBe("unavailable");
  });

  it("still rings a receiver who IS connected - the fix must not refuse real calls", async () => {
    const inst = await startInstance();
    const caller = await connect(inst.port, "caller-2");
    const receiver = await connect(inst.port, "receiver-2");

    const incoming = waitFor(receiver, "incoming-call");
    const rejected = waitFor(caller, "call-rejected", 400);

    caller.emit("call-user", { receiverId: "receiver-2" });

    expect(await incoming).not.toBeNull();
    expect(await rejected).toBeNull();
  });

  it("releases the caller once the receiver has disconnected again", async () => {
    const inst = await startInstance();
    const caller = await connect(inst.port, "caller-3");
    const receiver = await connect(inst.port, "receiver-3");

    // Reachable first...
    const firstRing = waitFor(receiver, "incoming-call");
    caller.emit("call-user", { receiverId: "receiver-3" });
    expect(await firstRing).not.toBeNull();

    // ...then gone. This is the backgrounded-app / dropped-connection
    // case, which behaved identically to "never connected" before.
    receiver.close();
    await new Promise((r) => setTimeout(r, 150));

    caller.emit("call-user", { receiverId: "receiver-3" });
    const rejected = (await waitFor(caller, "call-rejected")) as { reason?: string } | null;
    expect(rejected?.reason).toBe("unavailable");
  });
});
