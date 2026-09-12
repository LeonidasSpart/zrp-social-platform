const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { getToken } = require("next-auth/jwt");
const {
  groupRoom,
  isBlockedEitherWay,
  isConversationMember,
  authorizeSendRelay,
  authorizeGroupSendRelay,
  authorizeEditRelay,
  authorizeReactionRelay,
  authorizeDeleteRelay,
  authorizeConversationDeleteRelay,
  createCallRegistry,
} = require("./socket-authz");
const { runLegacyPasswordMigrationAtStartup } = require("./legacy-passwords");
const {
  createPresenceTracker,
  createRedisPresenceStore,
  createRedisPresenceBus,
} = require("./presence");

// Minimal cookie-header parser, written inline rather than requiring
// the "cookie" package - this file is the process entrypoint, so a
// missing/unhoisted transitive dependency here would crash the entire
// server at startup instead of just failing one route. The format is
// simple enough (name=value pairs separated by "; ") that a tiny
// hand-rolled parser is safer than betting on module resolution.
function parseCookieHeader(header) {
  const result = {};
  if (!header) return result;
  header.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name) return;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  });
  return result;
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
// Prisma 7+ requires an explicit driver adapter - see src/lib/db.ts for
// why connectionTimeoutMillis is set explicitly (the `pg` driver has no
// default connection timeout). This is a separate PrismaClient instance
// from src/lib/db.ts's, matching this file's existing pre-Prisma-7
// architecture: server.js has always run its own client for socket
// authorization and the boot-time password migration, independent of
// the Next.js API routes' client.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }),
});

// ─── Online presence ─────────────────────────────────────────────────
// Was a per-process `userStatus` Map, which is only correct with exactly
// one server process: with several, a user connected to instance A was
// "offline" to everyone on instance B, so the conversation header showed
// Offline for someone actively chatting. Presence now lives in
// ./presence.js: per-instance socket counts (authoritative for this
// process) shared through Redis when REDIS_URL is set, with a heartbeat
// so a dead instance can never leave a user "online", and a pub/sub
// bus so every instance relays every transition to its own sockets.
// Without Redis it degrades to exactly the old single-process behaviour.
const PRESENCE_HEARTBEAT_MS = 30 * 1000;
const PRESENCE_INSTANCE_ID = `${process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || "inst"}-${process.pid}`;

async function connectPresenceRedis() {
  const url = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
  if (!url) return null;
  try {
    const { createClient } = require("redis");
    const pub = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(1000 * 2 ** Math.min(retries, 5), 30_000),
      },
    });
    const sub = pub.duplicate();
    let lastLog = 0;
    const onError = (err) => {
      // node-redis reconnects on its own; keep the log quiet.
      const now = Date.now();
      if (now - lastLog > 60_000) {
        lastLog = now;
        console.error("presence redis error (presence falls back to local until it heals):", err && err.message);
      }
    };
    pub.on("error", onError);
    sub.on("error", onError);
    // Bounded first attempt: a Redis that is unreachable from boot must
    // not delay the HTTP server. The clients keep trying in the
    // background and the store checks `isReady` on every call.
    await Promise.race([
      Promise.all([pub.connect(), sub.connect()]),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    return { pub, sub };
  } catch (err) {
    console.error("presence redis unavailable (presence is local to this instance):", err && err.message);
    return null;
  }
}

// ─── Allowed origins for the socket server ───────────────────────────
// Previously this was `origin: "*"`, which combined with zero handshake
// auth meant literally any page on the internet could open a socket and
// join any room. Origin alone was never going to fix the identity
// spoofing (see auth middleware below), but there's no reason to leave
// it wide open either. Set SOCKET_ALLOWED_ORIGINS as a comma-separated
// list on Railway if the Capacitor iOS/Android app needs an extra entry
// (e.g. "capacitor://localhost,http://localhost") - falls back to
// NEXTAUTH_URL alone if unset.
const allowedOrigins = (process.env.SOCKET_ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.prepare().then(async () => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/api/socket.io",
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Chat events (send-message, typing, reactions) are small JSON and
    // would be fine well under 64KB - but call-user/accept-call carry a
    // WebRTC "signal" payload from simple-peer, and peers are created
    // with trickle: false, so that's not a small JSON blob: it's a full
    // SDP offer/answer with every gathered ICE candidate embedded
    // (host + server-reflexive + TURN relay, across every iceServer
    // entry returned by /api/turn-credentials, on every network
    // interface). That routinely exceeds 64KB, especially for video
    // calls or a device with multiple interfaces (wifi + cellular).
    // Socket.IO enforces this limit on the websocket transport too
    // (this client uses websocket-only, see socket-client.ts), so an
    // oversized signal doesn't just fail to send - it gets the whole
    // socket connection dropped by the server, which is exactly what
    // "I can't make calls" reports from this app would look like.
    // 1MB (Socket.IO's own default) comfortably fits even a
    // candidate-heavy offer while staying far too small to serve as a
    // file-transfer channel.
    maxHttpBufferSize: 1024 * 1024,
  });

  // ─── Presence tracker (see the comment at the top of this file) ───
  const presenceRedis = await connectPresenceRedis();
  let presenceBus = null;
  const presence = createPresenceTracker({
    instanceId: PRESENCE_INSTANCE_ID,
    store: presenceRedis ? createRedisPresenceStore(presenceRedis.pub) : null,
    onChange: (userId, status) => {
      // Global transition: tell every socket on this instance, and every
      // other instance (which tells its own sockets).
      io.emit("user-status", { userId, status });
      if (presenceBus) presenceBus.publish(userId, status);
    },
  });
  if (presenceRedis) {
    try {
      presenceBus = await createRedisPresenceBus(
        presenceRedis.pub,
        presenceRedis.sub,
        PRESENCE_INSTANCE_ID,
        (userId, status) => io.emit("user-status", { userId, status })
      );
      console.log(`🟢 Presence shared via Redis (instance ${PRESENCE_INSTANCE_ID})`);
    } catch (err) {
      console.error("presence bus unavailable (transitions stay local to this instance):", err && err.message);
    }
  } else {
    console.log("🟡 Presence is local to this instance (no Redis)");
  }
  setInterval(() => {
    presence.heartbeat();
  }, PRESENCE_HEARTBEAT_MS).unref();

  // ─── Per-user connection cap ──────────────────────────────────────
  // Without this, one account could open unbounded sockets (a script,
  // a buggy client stuck in a reconnect loop) and hold that many
  // concurrent connections indefinitely.
  const MAX_CONNECTIONS_PER_USER = 8;
  const connectionCounts = new Map(); // userId -> count

  // ─── Simple in-memory sliding-window limiter for the most abuse-
  // prone events (message send, call signaling) ─────────────────────
  const eventBuckets = new Map(); // `${userId}:${event}` -> { count, resetAt }
  function checkEventRateLimit(userId, event, limit, windowMs) {
    const key = `${userId}:${event}`;
    const now = Date.now();
    let bucket = eventBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      eventBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
  // ─── Call signaling state ─────────────────────────────────────────
  // Which calls are ringing/active between which two users - see
  // socket-authz.js. accept/reject/end are only relayed for a call
  // that was actually placed, and only by one of its two parties.
  const calls = createCallRegistry();

  // Periodic sweep so eventBuckets/connectionCounts can't grow
  // unbounded from users who connect once and never come back.
  setInterval(() => {
    const now = Date.now();
    eventBuckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) eventBuckets.delete(key);
    });
    calls.sweep();
  }, 5 * 60 * 1000).unref();

  // ─── Per-socket cache of "is this user blocked either way" ────────
  // Typing indicators fire on every keystroke; a DB lookup per
  // keystroke would be wasteful, but blocked users must not be able to
  // make a victim's chat show "typing…" either. Cache per socket for a
  // short window.
  const BLOCK_CACHE_TTL_MS = 60 * 1000;
  async function isBlockedCached(socket, otherUserId) {
    if (!socket.data.blockCache) socket.data.blockCache = new Map();
    const cached = socket.data.blockCache.get(otherUserId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.blocked;
    const blocked = await isBlockedEitherWay(prisma, socket.data.userId, otherUserId);
    if (socket.data.blockCache.size > 500) socket.data.blockCache.clear();
    socket.data.blockCache.set(otherUserId, { blocked, expiresAt: now + BLOCK_CACHE_TTL_MS });
    return blocked;
  }

  // ─── Handshake authentication ────────────────────────────────────
  // Previously every event handler below trusted whatever userId /
  // senderId / callerId the client sent in the payload - meaning any
  // visitor could `join-room` as someone else's userId and read their
  // DMs/calls in real time, or spoof a senderId so a victim's chat UI
  // showed a message "from" someone it didn't come from.
  //
  // This verifies the NextAuth session JWT (same cookie the Next.js
  // app itself trusts) on connect, and stores the *verified* userId on
  // socket.data. Every handler below now uses socket.data.userId for
  // anything identity-related instead of trusting the payload.
  io.use(async (socket, next) => {
    try {
      // Two separate problems needed fixing here, both stemming from
      // socket.request being a raw Node http.IncomingMessage rather
      // than a Next.js-normalized request:
      //
      // 1. secureCookie guessing (fixed previously - tries both cookie
      //    name variants below, independent of NODE_ENV).
      //
      // 2. Cookie CHUNKING. This app's JWT carries a lot - id,
      //    username, role, badgeType, plan, features, onboardingCompleted,
      //    a full avatarUrl, etc. Once that's JWE-encrypted it very
      //    plausibly exceeds the ~4KB single-cookie limit, so NextAuth
      //    splits it into "next-auth.session-token.0",
      //    ".1", etc. getToken() knows how to reconstruct chunked
      //    cookies, but only when it's given a pre-parsed `cookies`
      //    object - a raw request only has `.headers.cookie` as one
      //    unparsed string, so getToken() had nothing to reconstruct
      //    from and always came back empty even with a perfectly valid
      //    session, matching the Railway logs exactly (cookie header
      //    present: true, yet no valid token found - immediately after
      //    a successful login too). Manually parsing the raw cookie
      //    header into an object and handing it to getToken() as
      //    req.cookies gives it everything it needs regardless of
      //    whether the token happens to be chunked.
      const parsedCookies = parseCookieHeader(socket.request.headers.cookie);
      const reqWithCookies = { ...socket.request, cookies: parsedCookies };

      let token = await getToken({
        req: reqWithCookies,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: true,
      });

      if (!token) {
        token = await getToken({
          req: reqWithCookies,
          secret: process.env.NEXTAUTH_SECRET,
          secureCookie: false,
        });
      }

      if (!token?.id) {
        console.error(
          `Socket auth rejected: no valid session token found (cookie header present: ${Boolean(
            socket.request.headers.cookie
          )}, cookie names: ${Object.keys(parsedCookies).join(", ") || "none"})`
        );
        return next(new Error("Unauthorized"));
      }

      const userId = String(token.id);

      // ⚠️ SECURITY: the banned flag inside the JWT is a snapshot from
      // when the token was minted - a user banned after that (or an
      // account since deleted) still carried a token saying
      // banned: false, and this handshake let them straight in to
      // message and call for the token's whole 30-day lifetime. Ask
      // the database, the same way src/lib/auth-state.ts does for the
      // HTTP side.
      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { banned: true },
      });
      if (!account || account.banned || token.banned) {
        return next(new Error("Account banned"));
      }
      const currentCount = connectionCounts.get(userId) || 0;
      if (currentCount >= MAX_CONNECTIONS_PER_USER) {
        return next(new Error("Too many active connections"));
      }

      socket.data.userId = userId;
      next();
    } catch (err) {
      console.error("Socket auth error:", err);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    connectionCounts.set(userId, (connectionCounts.get(userId) || 0) + 1);
    console.log(`🔌 Socket connected: ${socket.id} (user ${userId})`);

    // ─── Join own room automatically ───────────────────────────────
    // No longer accepts a client-supplied userId - the room a socket
    // joins is exactly the verified identity from the handshake, so
    // there's no way to subscribe to someone else's room.
    socket.join(userId);
    // Registers this socket; emits "user-status: online" (locally and to
    // other instances) only if the user was not already online anywhere.
    presence.connect(userId).catch((err) => console.error("presence connect error:", err));

    // Kept as a no-op-compatible listener so existing clients that
    // still emit "join-room" on connect (see socket-client.ts) don't
    // error out - it just re-confirms the same verified room instead
    // of trusting whatever id the client passes.
    socket.on("join-room", () => {
      socket.join(userId);
    });

    // ─── Request status for a specific user ──────────────────────
    socket.on("get-status", async (targetUserId) => {
      if (typeof targetUserId !== "string" || !targetUserId || targetUserId.length > 128) return;
      // Clients re-request every watched user on each reconnect, so this
      // is bursty by design; the cap only stops runaway loops.
      if (!checkEventRateLimit(userId, "get-status", 200, 10_000)) return;
      try {
        const isOnline = await presence.isOnline(targetUserId);
        socket.emit("user-status", { userId: targetUserId, status: isOnline ? "online" : "offline" });
      } catch (err) {
        console.error("get-status error:", err);
      }
    });

    // ─── Messaging ──────────────────────────────────────────────
    // ⚠️ SECURITY: every relay below is now authorized against the
    // database record rather than the client's description of it -
    // see socket-authz.js for the full write-up. In short: the REST
    // route has already performed the send/edit/delete/reaction; the
    // socket's only job is to tell the OTHER participant about it, and
    // the "what" and the "who" are both loaded from the row the REST
    // route wrote, never taken from the payload. The payload shapes
    // the web, iOS and Android clients emit are unchanged.
    socket.on("send-message", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "send-message", 30, 10_000)) return;
      try {
        const relay = await authorizeSendRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("receive-message", relay.message);
        io.to(userId).emit("message-sent", relay.message);
      } catch (err) {
        console.error("send-message relay error:", err);
      }
    });

    socket.on("typing", async ({ receiverId, isTyping } = {}) => {
      if (!receiverId || typeof receiverId !== "string" || receiverId === userId) return;
      if (!checkEventRateLimit(userId, "typing", 60, 10_000)) return;
      try {
        if (await isBlockedCached(socket, receiverId)) return;
        socket.to(receiverId).emit("user-typing", { userId, isTyping: isTyping === true });
      } catch (err) {
        console.error("typing relay error:", err);
      }
    });

    // ─── Group conversation rooms ─────────────────────────────────
    // Prefixed ("group:<id>") specifically so it can never collide
    // with a userId room - Conversation and User ids are both cuids
    // in the same format, so an unprefixed room name could otherwise
    // be ambiguous between "the user with this id" and "the group
    // with this id". Membership is the ConversationParticipant row and
    // is re-checked per event (cached briefly per socket for the
    // keystroke-rate typing event), never just once at join time - a
    // socket can outlive a since-revoked membership until it
    // reconnects. See socket-authz.js.
    const MEMBERSHIP_CACHE_TTL_MS = 30 * 1000;
    async function isMemberCached(conversationId) {
      if (!socket.data.memberCache) socket.data.memberCache = new Map();
      const cached = socket.data.memberCache.get(conversationId);
      const now = Date.now();
      if (cached && cached.expiresAt > now) return cached.member;
      const member = await isConversationMember(prisma, userId, conversationId);
      if (socket.data.memberCache.size > 200) socket.data.memberCache.clear();
      socket.data.memberCache.set(conversationId, { member, expiresAt: now + MEMBERSHIP_CACHE_TTL_MS });
      return member;
    }

    socket.on("join-conversation", async (conversationId) => {
      if (!conversationId || typeof conversationId !== "string") return;
      if (!checkEventRateLimit(userId, "join-conversation", 30, 10_000)) return;
      try {
        // Real server-side membership check - never trust that a
        // client asking to join a conversation room actually belongs
        // to it, the same principle "join-room" above already applies
        // to a user's own 1:1 room.
        if (await isConversationMember(prisma, userId, conversationId)) {
          socket.join(groupRoom(conversationId));
        }
      } catch (err) {
        console.error("join-conversation error:", err);
      }
    });

    socket.on("leave-conversation", (conversationId) => {
      if (!conversationId || typeof conversationId !== "string") return;
      socket.leave(groupRoom(conversationId));
    });

    // ⚠️ SECURITY: like send-message above, the relayed record is the
    // row the REST route wrote (sender = this user, in this
    // conversation), never the payload's `content`.
    socket.on("send-group-message", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "send-group-message", 30, 10_000)) return;
      try {
        const relay = await authorizeGroupSendRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("receive-group-message", relay.message);
      } catch (err) {
        console.error("send-group-message relay error:", err);
      }
    });

    socket.on("typing-group", async ({ conversationId, isTyping } = {}) => {
      if (!conversationId || typeof conversationId !== "string") return;
      if (!checkEventRateLimit(userId, "typing-group", 60, 10_000)) return;
      try {
        if (!(await isMemberCached(conversationId))) return;
        socket
          .to(groupRoom(conversationId))
          .emit("user-typing-group", { conversationId, userId, isTyping: isTyping === true });
      } catch (err) {
        console.error("typing-group relay error:", err);
      }
    });

    // ─── Delete / edit / reaction relay ──────────────────────────
    socket.on("delete-message", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "delete-message", 30, 10_000)) return;
      try {
        const relay = await authorizeDeleteRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("message-deleted", { messageId: relay.messageId });
      } catch (err) {
        console.error("delete-message relay error:", err);
      }
    });

    socket.on("delete-conversation", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "delete-conversation", 10, 300_000)) return;
      try {
        const relay = await authorizeConversationDeleteRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("conversation-deleted", { withUserId: userId });
        // Also tell the deleting user's own other sessions/tabs - the
        // sidebar list (messages/layout.tsx, messages/page.tsx) uses its
        // own useConversationList() instance, separate from the open
        // thread's, so it has no other way to learn the conversation it's
        // showing is now gone.
        io.to(userId).emit("conversation-deleted", { withUserId: relay.targetId });
      } catch (err) {
        console.error("delete-conversation relay error:", err);
      }
    });

    socket.on("edit-message", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "edit-message", 30, 10_000)) return;
      try {
        const relay = await authorizeEditRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("message-edited", { message: relay.message });
      } catch (err) {
        console.error("edit-message relay error:", err);
      }
    });

    socket.on("message-reaction", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (!checkEventRateLimit(userId, "message-reaction", 60, 10_000)) return;
      try {
        const relay = await authorizeReactionRelay(prisma, userId, payload);
        if (!relay.ok) return;
        io.to(relay.targetId).emit("reaction-updated", {
          messageId: relay.messageId,
          reactions: relay.reactions,
        });
      } catch (err) {
        console.error("message-reaction relay error:", err);
      }
    });

    socket.on("mark-read", async ({ messageId }) => {
      if (!messageId) return;
      try {
        // Only the actual receiver of a message may mark it read -
        // previously any connected client could flip read=true on any
        // messageId it guessed or observed.
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { receiverId: true, senderId: true },
        });
        if (!message || message.receiverId !== userId) return;

        await prisma.message.update({ where: { id: messageId }, data: { read: true } });
        io.to(message.senderId).emit("message-read", { messageId });
      } catch (err) {
        console.error("mark-read error:", err);
      }
    });

    // ─── Call Signaling ──────────────────────────────────────────
    // callerId is now always the verified identity - a client can no
    // longer place a call that appears to originate from another user.
    //
    // ⚠️ SECURITY: accept-call / reject-call / end-call are only
    // relayed for a call that was actually placed via call-user, and
    // only by one of that call's two parties - previously any user
    // could send "call-accepted" (carrying an arbitrary WebRTC answer)
    // or "call-ended" to anyone at all. A call can't be placed to a
    // user who has blocked the caller (or vice versa) either. The
    // callerName shown to the callee is the caller's real name from
    // the database, not whatever the payload claimed.
    socket.on("call-user", async ({ receiverId, signal, isVideo } = {}) => {
      if (!receiverId || typeof receiverId !== "string" || receiverId === userId) return;
      if (!checkEventRateLimit(userId, "call-user", 10, 30_000)) return;
      try {
        if (await isBlockedCached(socket, receiverId)) return;
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, username: true },
        });
        if (!caller) return;

        // Nobody is listening: tell the caller now instead of leaving
        // them ringing.
        //
        // `io.to(receiverId).emit(...)` into an empty room succeeds
        // silently - the event goes nowhere and nothing ever answers.
        // The caller's UI sets state "calling" and has no timeout of any
        // kind (src/app/messages/[username]/page.tsx), so before this it
        // rang until the person gave up and reloaded. That was true for
        // ANY unreachable recipient - a logged-out user, a backgrounded
        // app, a dropped connection - not only for clients that cannot
        // answer.
        //
        // `call-rejected` is the existing event every current client
        // already handles, so this releases them with no client change.
        // `reason` is additive: today's clients ignore it, and a client
        // that wants to distinguish "declined" from "never reachable"
        // can read it without a protocol change. The web string still
        // says "Call was rejected", which is imprecise for this case -
        // wording that needs a real translation pass across 11 locales,
        // deliberately not machine-invented here.
        let receiverOnline = true;
        try {
          receiverOnline = await presence.isOnline(receiverId);
        } catch (err) {
          // Presence is a convenience, not authority. If its store is
          // unreachable, fall through and ring: a call that might work
          // beats refusing one that would have.
          console.error("call-user presence check failed:", err);
        }
        if (!receiverOnline) {
          socket.emit("call-rejected", { reason: "unavailable" });
          return;
        }

        calls.start(userId, receiverId);
        console.log(`📞 call-user from ${userId} to ${receiverId}`);
        io.to(receiverId).emit("incoming-call", {
          callerId: userId,
          callerName: caller.name || caller.username,
          signal,
          isVideo: isVideo === true,
        });
      } catch (err) {
        console.error("call-user relay error:", err);
      }
    });

    socket.on("accept-call", ({ callerId, signal } = {}) => {
      if (!callerId || typeof callerId !== "string") return;
      if (!calls.accept(userId, callerId)) return;
      console.log(`✅ accept-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-accepted", { signal });
    });

    socket.on("reject-call", ({ callerId } = {}) => {
      if (!callerId || typeof callerId !== "string") return;
      if (!calls.reject(userId, callerId)) return;
      console.log(`❌ reject-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-rejected");
    });

    socket.on("end-call", ({ callerId } = {}) => {
      if (!callerId || typeof callerId !== "string") return;
      if (!calls.end(userId, callerId)) return;
      console.log(`🔚 end-call from ${userId} to ${callerId}`);
      io.to(callerId).emit("call-ended");
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on("disconnect", () => {
      const remaining = (connectionCounts.get(userId) || 1) - 1;
      if (remaining <= 0) {
        // Last connection gone: forget any call this user was party
        // to so the registry can't hold a stale entry forever. Only on
        // the LAST socket - a second tab closing must not wipe a call
        // that is still running in the first one.
        calls.dropUser(userId);
        connectionCounts.delete(userId);
      } else {
        connectionCounts.set(userId, remaining);
      }
      // Emits "user-status: offline" only when this was the user's last
      // socket on EVERY instance - a second tab or device elsewhere
      // keeps them online.
      presence.disconnect(userId).catch((err) => console.error("presence disconnect error:", err));
      console.log(`🔌 User ${userId} disconnected (socket ${socket.id})`);
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);

    // ⚠️ SECURITY: the login path accepts bcrypt hashes only (see
    // src/lib/auth.ts). Any account whose stored password is still the
    // legacy plaintext value is hashed in place here, automatically, on
    // every boot - so the removal of the plaintext fallback never needs
    // a manual migration step and never locks anyone out for longer
    // than the seconds this takes. Once the data is clean this is a
    // single COUNT per boot. Runs after listen() so health checks pass
    // while it works; a failure is logged and retried next boot. Set
    // LEGACY_PASSWORD_MIGRATION=off to skip (e.g. a read-only replica).
    if (process.env.LEGACY_PASSWORD_MIGRATION !== "off") {
      runLegacyPasswordMigrationAtStartup(prisma);
    }
  });
});
