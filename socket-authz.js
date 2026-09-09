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
 * Call signaling registry. accept-call / reject-call / end-call used to
 * be relayed to any `callerId` the client named, so a user could emit
 * "call-accepted" (with an arbitrary WebRTC signal) or "call-ended" to
 * someone who never called them. Now a call must have been placed
 * (call-user) before anyone can accept, reject or end it, and only the
 * two parties to that call can do so.
 *
 * In-memory and per-instance, like the rest of server.js's socket
 * state - see the multi-instance note in the security report.
 */
function createCallRegistry(options) {
  const pendingTtlMs = (options && options.pendingTtlMs) || 2 * 60 * 1000;
  const activeTtlMs = (options && options.activeTtlMs) || 6 * 60 * 60 * 1000;
  const calls = new Map(); // key -> { callerId, receiverId, state, updatedAt }

  function key(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

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
  createCallRegistry,
};
