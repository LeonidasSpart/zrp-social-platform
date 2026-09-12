/*
 * Socket.IO authorization helpers (CommonJS - required by server.js,
 * which is a plain Node entrypoint and cannot import the TypeScript
 * helpers under src/).
 *
 * ⚠️ SECURITY: server.js relays real-time events for actions the REST
 * routes have already performed. Every relay used to trust the CLIENT's
 * description of what happened: the caller chose the `receiverId` the
 * event went to, the `message` object shown as "edited", the
 * `reactions` array shown as the message's reactions, the `content` of
 * a "received" message. The only verified fact was the sender's own
 * identity. So any authenticated user could push a fabricated edit,
 * reaction list or "new message" - attributed to themselves, but with
 * arbitrary content - into ANY other user's open chat, or answer a call
 * nobody placed.
 *
 * Each helper here answers "is the verified user allowed to relay this,
 * and to whom", loading the authoritative record from the database and
 * returning THAT as the payload to relay. The client's copy of the
 * record is never forwarded.
 *
 * `prisma` is injected so these are unit-testable without a database.
 */

const USER_SELECT = { id: true, username: true, name: true, avatarUrl: true, badgeType: true };
const REACTION_USER_SELECT = { id: true, username: true, name: true, avatarUrl: true };

// The same include shape the REST edit route returns (see
// src/app/api/messages/edit/[id]/route.ts), so a relayed record is
// byte-for-byte the object the client would have received from REST.
const MESSAGE_RELAY_INCLUDE = {
  sender: { select: USER_SELECT },
  replyTo: { include: { sender: { select: USER_SELECT } } },
  reactions: { include: { user: { select: REACTION_USER_SELECT } } },
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/** Whether either user has blocked the other. */
async function isBlockedEitherWay(prisma, userId, otherUserId) {
  const block = await prisma.blocked.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

/**
 * send-message: the message must exist, have been sent BY the verified
 * user TO the claimed receiver. Returns the stored record to relay.
 */
async function authorizeSendRelay(prisma, userId, payload) {
  const messageId = payload && payload.messageId;
  const receiverId = payload && payload.receiverId;
  if (!isNonEmptyString(messageId) || !isNonEmptyString(receiverId)) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: MESSAGE_RELAY_INCLUDE,
  });
  if (!message) return { ok: false };
  if (message.senderId !== userId || message.receiverId !== receiverId) return { ok: false };

  return { ok: true, message, targetId: message.receiverId };
}

/*
 * Group conversations. A GROUP message row carries `conversationId` and
 * a null `receiverId`; its real-time room is "group:<conversationId>"
 * (prefixed so it can never collide with a userId room - both are
 * cuids). Membership is the ConversationParticipant row and is checked
 * per event, never just once at join time: a socket can outlive a
 * since-revoked membership until it reconnects.
 */
function groupRoom(conversationId) {
  return `group:${conversationId}`;
}

async function isConversationMember(prisma, userId, conversationId) {
  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return membership !== null;
}

/**
 * send-group-message: the message must exist, have been sent BY the
 * verified user INTO the claimed conversation, and the user must still
 * be a member. Returns the stored row to relay (the minimal shape the
 * group clients hydrate from - see src/lib/groupMessageHydration.ts -
 * built from the database, not from the payload's `content`).
 */
async function authorizeGroupSendRelay(prisma, userId, payload) {
  const messageId = payload && payload.messageId;
  const conversationId = payload && payload.conversationId;
  if (!isNonEmptyString(messageId) || !isNonEmptyString(conversationId)) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      conversationId: true,
      content: true,
      imageUrl: true,
      createdAt: true,
      read: true,
    },
  });
  if (!message) return { ok: false };
  if (message.senderId !== userId || message.conversationId !== conversationId) return { ok: false };
  if (!(await isConversationMember(prisma, userId, conversationId))) return { ok: false };

  return {
    ok: true,
    message: {
      id: message.id,
      senderId: message.senderId,
      conversationId: message.conversationId,
      content: message.content,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt,
      read: message.read,
    },
    targetId: groupRoom(conversationId),
  };
}

/**
 * edit-message: the message must exist and the verified user must be
 * its sender. The relayed record is the stored (already edited) row;
 * the client-supplied `message` object is ignored entirely. The target
 * room comes from the row: the group's room for a group message, the
 * receiver's room for a 1:1 message - never from the payload.
 */
async function authorizeEditRelay(prisma, userId, payload) {
  const messageId = payload && payload.message && payload.message.id;
  if (!isNonEmptyString(messageId)) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: MESSAGE_RELAY_INCLUDE,
  });
  if (!message || message.senderId !== userId) return { ok: false };

  if (message.conversationId) {
    return { ok: true, message, targetId: groupRoom(message.conversationId) };
  }
  if (!message.receiverId) return { ok: false };
  return { ok: true, message, targetId: message.receiverId };
}

/**
 * message-reaction: the verified user must be a participant - one of the
 * two parties of a 1:1 message, or a current member of a group message's
 * conversation. The relayed reaction list is loaded from the database;
 * the target (the other party's room, or the group room) is derived
 * from the record rather than the payload.
 */
async function authorizeReactionRelay(prisma, userId, payload) {
  const messageId = payload && payload.messageId;
  if (!isNonEmptyString(messageId)) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, receiverId: true, conversationId: true },
  });
  if (!message) return { ok: false };

  let targetId;
  if (message.conversationId) {
    if (!(await isConversationMember(prisma, userId, message.conversationId))) return { ok: false };
    targetId = groupRoom(message.conversationId);
  } else {
    if (message.senderId !== userId && message.receiverId !== userId) return { ok: false };
    targetId = message.senderId === userId ? message.receiverId : message.senderId;
    if (!targetId) return { ok: false };
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    include: { user: { select: REACTION_USER_SELECT } },
  });

  return { ok: true, messageId, reactions, targetId };
}

/**
 * delete-message: the row is already gone by the time this fires, so
 * ownership can't be checked against it. What can be checked is that
 * the verified user is actually party to the conversation the relay
 * targets: a current member of the named group, or someone with a real
 * 1:1 thread with the claimed receiver - which is the only thing the
 * relay conveys ("a message in our conversation was deleted"). Message
 * ids are cuids, so a fabricated id for a real message the sender isn't
 * party to is not guessable in practice.
 */
async function authorizeDeleteRelay(prisma, userId, payload) {
  const messageId = payload && payload.messageId;
  if (!isNonEmptyString(messageId)) return { ok: false };

  const conversationId = payload && payload.conversationId;
  if (isNonEmptyString(conversationId)) {
    if (!(await isConversationMember(prisma, userId, conversationId))) return { ok: false };
    return { ok: true, messageId, targetId: groupRoom(conversationId) };
  }

  const receiverId = payload && payload.receiverId;
  if (!isNonEmptyString(receiverId)) return { ok: false };
  if (receiverId === userId) return { ok: false };

  const any = await prisma.message.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId },
        { senderId: receiverId, receiverId: userId },
      ],
    },
    select: { id: true },
  });
  if (!any) return { ok: false };

  return { ok: true, messageId, targetId: receiverId };
}

/**
 * delete-conversation: unlike authorizeDeleteRelay above, this fires
 * AFTER the whole 1:1 conversation's messages are already gone (the
 * REST route already ran the real DELETE and returned success) - so
 * there is no "did we ever exchange messages" fact left in the
 * database to check against. The only real verification left is that
 * `otherUserId` names an actual user and isn't the caller themselves,
 * which stops this event being used to make an arbitrary/garbage id
 * "conversation-deleted" pop someone's sidebar for no reason. This is
 * a UI-only signal (the receiving client just drops a row from its
 * conversation list; a stale/duplicate one is harmless and
 * self-corrects on that list's own next real fetch), not a
 * authorization boundary for the deletion itself - that boundary is
 * the REST route's own session + ownership check.
 */
async function authorizeConversationDeleteRelay(prisma, userId, payload) {
  const otherUserId = payload && payload.otherUserId;
  if (!isNonEmptyString(otherUserId)) return { ok: false };
  if (otherUserId === userId) return { ok: false };

  const user = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
  if (!user) return { ok: false };

  return { ok: true, targetId: otherUserId };
}

/**
 * Call signaling registry. accept-call / reject-call / end-call used to
 * be relayed to any `callerId` the client named, so a user could emit
 * "call-accepted" (with an arbitrary WebRTC signal) or "call-ended" to
 * someone who never called them. Now a call must have been placed
 * (call-user) before anyone can accept, reject or end it, and only the
 * two parties to that call can do so.
 *
 * ⚠️ MULTI-INSTANCE: the Socket.IO Redis adapter (server.js) distributes
 * *events* across Railway replicas - it does not distribute this
 * registry's application state. Without a shared store, a call started
 * on the replica the caller is connected to is invisible to the
 * accept/reject/end handler running on whichever replica the OTHER
 * party is connected to - `incoming-call` would still arrive (the
 * adapter delivers that fine), but tapping Accept would silently no-op,
 * because that replica's own in-memory Map never saw `start()`. This is
 * invisible on a single replica (today's actual deployment - the two
 * parties are always handled by the same process) and would only
 * surface the moment a second replica exists.
 *
 * Passing `redisClient` (a connected node-redis v4 client, reused from
 * presence's own connection - see server.js) makes call state
 * authoritative in Redis instead of process memory, so any replica can
 * correctly accept/reject/end a call regardless of which replica placed
 * it. Without one, this falls back to the original in-memory Map
 * unchanged - same behavior as before, correct for the single-replica
 * deployment that exists today, and what every existing synchronous
 * unit test below still exercises.
 *
 * Redis design:
 *  - key: `call:<sorted userId pair>` (deterministic from the two
 *    parties, exactly like the in-memory Map's own key(a,b))
 *  - value: JSON `{callerId, receiverId, state, updatedAt}`
 *  - TTL: PX on every write (pendingTtlMs while ringing, activeTtlMs
 *    once accepted) - Redis expires stale entries on its own, so there
 *    is no separate sweep() to run (sweep() is kept as a no-op so
 *    server.js's periodic call doesn't need to know which mode is active)
 *  - atomicity: accept/reject read-check-write as one Lua script, so two
 *    concurrent accept calls (or an accept racing a reject) can't both
 *    win - only one caller ever gets `true` back, exactly like the
 *    in-memory version's single-threaded Map access already guaranteed
 *  - end: a plain DEL - idempotent by construction (a second end() on an
 *    already-deleted key correctly reports false, no different from the
 *    in-memory version)
 *  - dropUser (on disconnect): SCAN (never KEYS - see src/lib/redis.ts's
 *    own comment on why) over the small `call:*` keyspace, since there
 *    is no live-call volume where that's expensive, and a secondary
 *    per-user index would itself go stale the moment a key expires via
 *    TTL without an explicit end()
 */
function createCallRegistry(options) {
  const opts = options || {};
  const pendingTtlMs = opts.pendingTtlMs || 2 * 60 * 1000;
  const activeTtlMs = opts.activeTtlMs || 6 * 60 * 60 * 1000;
  const redis = opts.redisClient || null;

  function key(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  if (!redis) {
    const calls = new Map(); // key -> { callerId, receiverId, state, updatedAt }

    function get(a, b) {
      const entry = calls.get(key(a, b));
      if (!entry) return null;
      const ttl = entry.state === "pending" ? pendingTtlMs : activeTtlMs;
      if (Date.now() - entry.updatedAt > ttl) {
        calls.delete(key(a, b));
        return null;
      }
      return entry;
    }

    return {
      /** call-user: record that callerId is ringing receiverId. */
      start(callerId, receiverId) {
        calls.set(key(callerId, receiverId), {
          callerId,
          receiverId,
          state: "pending",
          updatedAt: Date.now(),
        });
      },
      /** accept-call by `userId` of a call from `callerId`. */
      accept(userId, callerId) {
        const entry = get(userId, callerId);
        if (!entry || entry.state !== "pending") return false;
        if (entry.callerId !== callerId || entry.receiverId !== userId) return false;
        entry.state = "active";
        entry.updatedAt = Date.now();
        return true;
      },
      /** reject-call by `userId` of a pending call from `callerId`. */
      reject(userId, callerId) {
        const entry = get(userId, callerId);
        if (!entry || entry.state !== "pending") return false;
        if (entry.callerId !== callerId || entry.receiverId !== userId) return false;
        calls.delete(key(userId, callerId));
        return true;
      },
      /** end-call by either party of a pending or active call. */
      end(userId, otherId) {
        const entry = get(userId, otherId);
        if (!entry) return false;
        calls.delete(key(userId, otherId));
        return true;
      },
      /** Drop every call involving a user (on disconnect). */
      dropUser(userId) {
        calls.forEach((entry, k) => {
          if (entry.callerId === userId || entry.receiverId === userId) calls.delete(k);
        });
      },
      sweep() {
        const now = Date.now();
        calls.forEach((entry, k) => {
          const ttl = entry.state === "pending" ? pendingTtlMs : activeTtlMs;
          if (now - entry.updatedAt > ttl) calls.delete(k);
        });
      },
      size() {
        return calls.size;
      },
    };
  }

  // ─── Redis-backed (multi-instance safe) ──────────────────────────
  const KEY_PREFIX = "call:";
  const redisKey = (a, b) => KEY_PREFIX + key(a, b);

  // Compare-and-swap: only transitions a call that is still pending AND
  // belongs to the exact caller/receiver pair named. Without this being
  // one atomic script, a GET-then-SET from this client has the same
  // race two concurrent callers of accept() would hit against a plain
  // Map - one Lua eval is how Redis gives that back.
  const ACCEPT_SCRIPT = `
local raw = redis.call("get", KEYS[1])
if not raw then return 0 end
local entry = cjson.decode(raw)
if entry.state ~= "pending" then return 0 end
if entry.callerId ~= ARGV[1] or entry.receiverId ~= ARGV[2] then return 0 end
entry.state = "active"
entry.updatedAt = tonumber(ARGV[3])
redis.call("set", KEYS[1], cjson.encode(entry), "PX", ARGV[4])
return 1
`;
  const REJECT_SCRIPT = `
local raw = redis.call("get", KEYS[1])
if not raw then return 0 end
local entry = cjson.decode(raw)
if entry.state ~= "pending" then return 0 end
if entry.callerId ~= ARGV[1] or entry.receiverId ~= ARGV[2] then return 0 end
redis.call("del", KEYS[1])
return 1
`;

  async function scanCallKeys() {
    const keys = [];
    let cursor = "0";
    do {
      const res = await redis.scan(cursor, { MATCH: `${KEY_PREFIX}*`, COUNT: 100 });
      // node-redis v4 returns `cursor` as a NUMBER, not the string this
      // loop starts from - comparing `0 !== "0"` is always true, which
      // made this loop forever. Normalizing to a string on every
      // iteration is what actually lets the loop terminate.
      cursor = String(res.cursor);
      keys.push(...res.keys);
    } while (cursor !== "0");
    return keys;
  }

  return {
    async start(callerId, receiverId) {
      const entry = JSON.stringify({
        callerId,
        receiverId,
        state: "pending",
        updatedAt: Date.now(),
      });
      await redis.set(redisKey(callerId, receiverId), entry, { PX: pendingTtlMs });
    },
    async accept(userId, callerId) {
      const result = await redis.eval(ACCEPT_SCRIPT, {
        keys: [redisKey(userId, callerId)],
        arguments: [callerId, userId, String(Date.now()), String(activeTtlMs)],
      });
      return result === 1;
    },
    async reject(userId, callerId) {
      const result = await redis.eval(REJECT_SCRIPT, {
        keys: [redisKey(userId, callerId)],
        arguments: [callerId, userId],
      });
      return result === 1;
    },
    async end(userId, otherId) {
      const deleted = await redis.del(redisKey(userId, otherId));
      return deleted > 0;
    },
    async dropUser(userId) {
      const keys = await scanCallKeys();
      if (keys.length === 0) return;
      const toDelete = [];
      for (const k of keys) {
        const raw = await redis.get(k);
        if (!raw) continue;
        try {
          const entry = JSON.parse(raw);
          if (entry.callerId === userId || entry.receiverId === userId) toDelete.push(k);
        } catch {
          // Malformed entry - not this registry's own data; leave it alone.
        }
      }
      if (toDelete.length > 0) await redis.del(toDelete);
    },
    // No-op: every write above carries its own PX TTL, so Redis expires
    // a stale call on its own without a periodic sweep.
    sweep() {},
    async size() {
      return (await scanCallKeys()).length;
    },
  };
}

module.exports = {
  MESSAGE_RELAY_INCLUDE,
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
};
