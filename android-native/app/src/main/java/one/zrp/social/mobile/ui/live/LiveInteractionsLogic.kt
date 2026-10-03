package one.zrp.social.mobile.ui.live

/**
 * Pure, Android-free logic behind ZRP Live's chat/gift/reaction state -
 * pulled out of LiveInteractionsController so it has real JUnit coverage
 * (src/test/.../ui/live/LiveInteractionsLogicTest.kt) without a fake
 * repository or coroutine test seam, the same split
 * LiveAudioRoomViewModel's addPendingSpeakerRequest/
 * removePendingSpeakerRequest already use.
 */

/** Server-side ceiling (live-chat/chat-service.ts MAX_MESSAGE_LENGTH) - mirrored so the composer can't even type past it. */
internal const val LIVE_CHAT_MAX_LENGTH = 500

/** Server-side per-request cap (live-reactions/reaction-service.ts MAX_TAPS_PER_REQUEST). */
internal const val LIVE_REACTION_MAX_PER_REQUEST = 20

/** Server-side ceiling (live-gifts/constants.ts MAX_GIFT_QUANTITY). */
internal const val LIVE_GIFT_MAX_QUANTITY = 100

/** How many chat rows this screen keeps in memory - a long-running room can't grow the list without bound. */
internal const val LIVE_CHAT_MAX_RETAINED = 400

/** Pending gift animations beyond this are dropped (oldest pending first) after coalescing - a burst must never build an unbounded backlog. */
internal const val LIVE_GIFT_MAX_QUEUE = 20

/** Concurrent reaction bursts on screen - a new one beyond this evicts the oldest. */
internal const val LIVE_REACTION_MAX_BURSTS = 10

/** One chat row, newest-first in every list below. [createdAt] is ISO-8601 (null only if a socket payload omitted it). */
data class LiveChatEntry(val id: String, val authorId: String, val body: String, val createdAt: String?)

/**
 * Adds a just-arrived message (socket broadcast or this device's own
 * successful POST - whichever lands first) at the newest end, ignoring a
 * duplicate id so the two paths never double-render the same message.
 */
internal fun prependChatMessage(
    newestFirst: List<LiveChatEntry>,
    message: LiveChatEntry,
    maxRetained: Int = LIVE_CHAT_MAX_RETAINED,
): List<LiveChatEntry> {
    if (newestFirst.any { it.id == message.id }) return newestFirst
    return (listOf(message) + newestFirst).take(maxRetained)
}

/** Appends an older history page (GET .../chat?cursor=) at the oldest end, skipping ids already present. */
internal fun appendOlderChatMessages(newestFirst: List<LiveChatEntry>, olderNewestFirst: List<LiveChatEntry>): List<LiveChatEntry> {
    if (olderNewestFirst.isEmpty()) return newestFirst
    val seen = newestFirst.mapTo(HashSet()) { it.id }
    return newestFirst + olderNewestFirst.filter { seen.add(it.id) }
}

internal fun removeChatMessage(newestFirst: List<LiveChatEntry>, messageId: String): List<LiveChatEntry> =
    newestFirst.filterNot { it.id == messageId }

/**
 * Whole seconds left on a chat cooldown (slow mode or the anti-spam
 * limiter), rounded UP so the composer never shows "0s" while the
 * server would still reject a send.
 */
internal fun cooldownRemainingSeconds(nowMillis: Long, untilMillis: Long): Int {
    val remaining = untilMillis - nowMillis
    if (remaining <= 0) return 0
    return ((remaining + 999) / 1000).toInt()
}

/**
 * Splits locally-accumulated reaction taps into the next request's
 * `count` and whatever must wait for a following request, so rapid
 * tapping costs one HTTP call per batch rather than one per tap, and
 * never sends more than the server accepts in one request.
 * Returns (sendNow, remaining).
 */
internal fun nextReactionBatch(pendingTaps: Int, maxPerRequest: Int = LIVE_REACTION_MAX_PER_REQUEST): Pair<Int, Int> {
    if (pendingTaps <= 0) return 0 to 0
    val send = minOf(pendingTaps, maxPerRequest)
    return send to (pendingTaps - send)
}

/** A rate_limited reaction response pauses local tapping silently until this passes - never an error toast. */
internal fun isReactionPaused(nowMillis: Long, pausedUntilMillis: Long): Boolean = nowMillis < pausedUntilMillis

/**
 * How many heart glyphs one `live-reaction:tap` burst draws. A count of
 * 50 is represented by a capped handful of particles plus a "+N" label,
 * never 50 separately animated views.
 */
internal fun reactionParticleCount(count: Int, maxParticles: Int = 6): Int = count.coerceIn(1, maxParticles)

/** One queued gift animation, driven by the server's `live-gift:sent` broadcast (never a client-side guess). */
data class LiveGiftEvent(
    val localId: Long,
    val transactionIds: List<String>,
    val senderId: String,
    val giftKey: String,
    val quantity: Int,
    val totalCoins: Int,
)

/**
 * Queues a gift animation. The head (index 0) is the one currently on
 * screen and is never mutated; a new event from the same sender for the
 * same gift as the LAST pending entry coalesces into it (one "x15"
 * banner instead of fifteen "x1" banners in a combo burst). A
 * transaction id that is already queued is ignored (a socket redelivery
 * after reconnect). If the queue still exceeds [maxQueue], the oldest
 * PENDING entries are dropped - the one on screen always finishes.
 */
internal fun enqueueGiftEvent(
    queue: List<LiveGiftEvent>,
    event: LiveGiftEvent,
    maxQueue: Int = LIVE_GIFT_MAX_QUEUE,
): List<LiveGiftEvent> {
    val incomingIds = event.transactionIds.toSet()
    if (queue.any { queued -> queued.transactionIds.any { it in incomingIds } }) return queue

    val last = queue.lastOrNull()
    val merged = if (queue.size >= 2 && last != null && last.senderId == event.senderId && last.giftKey == event.giftKey) {
        queue.dropLast(1) + last.copy(
            transactionIds = last.transactionIds + event.transactionIds,
            quantity = last.quantity + event.quantity,
            totalCoins = last.totalCoins + event.totalCoins,
        )
    } else {
        queue + event
    }

    if (merged.size <= maxQueue) return merged
    val overflow = merged.size - maxQueue
    // Keep the head (on screen), drop the oldest pending entries after it.
    return listOf(merged.first()) + merged.drop(1 + overflow)
}

/** Shorter on-screen time per gift while a backlog exists, so a burst drains instead of lagging minutes behind the room. */
internal fun giftDisplayDurationMillis(queueSize: Int): Long = if (queueSize > 3) 1_200L else 2_400L

/**
 * One logical "send this gift" attempt. [idempotencyKey] is reused ONLY
 * when the user retries the exact same gift + quantity after an attempt
 * whose outcome is unknown (no HTTP response at all) - that request may
 * have committed server-side, and reusing its key turns a retry into a
 * safe duplicate_transaction instead of a second charge. Any other
 * change (different gift or quantity, or a definite server answer)
 * starts a fresh key.
 */
data class LiveGiftAttempt(val idempotencyKey: String, val giftKey: String, val quantity: Int)

internal fun resolveGiftAttempt(
    previousUnresolved: LiveGiftAttempt?,
    giftKey: String,
    quantity: Int,
    newKey: () -> String,
): LiveGiftAttempt =
    if (previousUnresolved != null && previousUnresolved.giftKey == giftKey && previousUnresolved.quantity == quantity) {
        previousUnresolved
    } else {
        LiveGiftAttempt(newKey(), giftKey, quantity)
    }

/** Total coin cost, or null if it would overflow / the inputs are invalid. */
internal fun giftTotalCoins(priceCoins: Int, quantity: Int): Long? {
    if (priceCoins < 1 || quantity < 1) return null
    return priceCoins.toLong() * quantity.toLong()
}

internal fun canAffordGift(balance: Int?, priceCoins: Int, quantity: Int): Boolean {
    val total = giftTotalCoins(priceCoins, quantity) ?: return false
    return balance != null && balance.toLong() >= total
}

/** Fallback display label for a gift key with no translated name yet: "rose_bouquet" -> "Rose bouquet". Real server data, just humanised. */
internal fun humanizeGiftKey(key: String): String {
    val words = key.split('_', '-').filter { it.isNotBlank() }
    if (words.isEmpty()) return key
    val joined = words.joinToString(" ")
    return joined.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
}

/**
 * The server only treats scheduledAt as "scheduled" when it is in the
 * future (createRoom: `scheduledAt > Date.now()`), and otherwise starts
 * the room LIVE immediately - so a past/near-now pick must be blocked
 * here, or "schedule for later" would silently go live now. A one-minute
 * margin absorbs the time between tapping submit and the server check.
 */
internal fun isValidScheduleTime(scheduledAtMillis: Long, nowMillis: Long): Boolean =
    scheduledAtMillis > nowMillis + 60_000L
