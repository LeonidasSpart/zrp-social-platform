package one.zrp.social.mobile.ui.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-function coverage for ZRP Live's client-side interaction logic
 * (LiveInteractionsLogic.kt) - the parts that decide what the user sees
 * and how often the app talks to the server, independent of Compose or
 * the network.
 */
class LiveInteractionsLogicTest {

    private fun msg(id: String) = LiveChatEntry(id = id, authorId = "u", body = "b$id", createdAt = null)

    private fun gift(localId: Long, tx: String, sender: String = "s1", key: String = "rose", qty: Int = 1, coins: Int = 10) =
        LiveGiftEvent(localId = localId, transactionIds = listOf(tx), senderId = sender, giftKey = key, quantity = qty, totalCoins = coins)

    // ─── Chat list ───────────────────────────────────────────────────

    @Test
    fun `prepend puts a new message at the newest end`() {
        val result = prependChatMessage(listOf(msg("2"), msg("1")), msg("3"))
        assertEquals(listOf("3", "2", "1"), result.map { it.id })
    }

    @Test
    fun `prepend ignores a duplicate id from the socket echo of my own send`() {
        val list = listOf(msg("2"), msg("1"))
        assertSame(list, prependChatMessage(list, msg("2")))
    }

    @Test
    fun `prepend caps retained messages, dropping the oldest`() {
        val result = prependChatMessage(listOf(msg("2"), msg("1")), msg("3"), maxRetained = 2)
        assertEquals(listOf("3", "2"), result.map { it.id })
    }

    @Test
    fun `older history appends at the oldest end without duplicates`() {
        val result = appendOlderChatMessages(listOf(msg("5"), msg("4")), listOf(msg("4"), msg("3"), msg("2")))
        assertEquals(listOf("5", "4", "3", "2"), result.map { it.id })
    }

    @Test
    fun `removing a deleted message leaves the rest in order`() {
        val result = removeChatMessage(listOf(msg("3"), msg("2"), msg("1")), "2")
        assertEquals(listOf("3", "1"), result.map { it.id })
    }

    // ─── Cooldown ────────────────────────────────────────────────────

    @Test
    fun `cooldown rounds up so the composer never shows zero while still blocked`() {
        assertEquals(1, cooldownRemainingSeconds(nowMillis = 10_000, untilMillis = 10_001))
        assertEquals(5, cooldownRemainingSeconds(nowMillis = 10_000, untilMillis = 15_000))
        assertEquals(0, cooldownRemainingSeconds(nowMillis = 15_000, untilMillis = 15_000))
        assertEquals(0, cooldownRemainingSeconds(nowMillis = 20_000, untilMillis = 15_000))
    }

    // ─── Reactions ───────────────────────────────────────────────────

    @Test
    fun `reaction batch sends everything pending when under the server cap`() {
        assertEquals(7 to 0, nextReactionBatch(7))
    }

    @Test
    fun `reaction batch never exceeds the per-request server cap`() {
        assertEquals(20 to 5, nextReactionBatch(25))
        assertEquals(LIVE_REACTION_MAX_PER_REQUEST, nextReactionBatch(1_000).first)
    }

    @Test
    fun `reaction batch is empty with nothing pending`() {
        assertEquals(0 to 0, nextReactionBatch(0))
        assertEquals(0 to 0, nextReactionBatch(-3))
    }

    @Test
    fun `rate limit pause holds until the deadline passes`() {
        assertTrue(isReactionPaused(nowMillis = 1_000, pausedUntilMillis = 5_000))
        assertFalse(isReactionPaused(nowMillis = 5_000, pausedUntilMillis = 5_000))
        assertFalse(isReactionPaused(nowMillis = 1_000, pausedUntilMillis = 0))
    }

    @Test
    fun `a burst of 50 draws a capped number of particles, never 50 views`() {
        assertEquals(6, reactionParticleCount(50))
        assertEquals(1, reactionParticleCount(1))
        assertEquals(3, reactionParticleCount(3))
        assertEquals(1, reactionParticleCount(0))
    }

    // ─── Gift animation queue ────────────────────────────────────────

    @Test
    fun `gift queue appends events from different senders`() {
        val q = enqueueGiftEvent(enqueueGiftEvent(emptyList(), gift(1, "t1", sender = "a")), gift(2, "t2", sender = "b"))
        assertEquals(listOf(1L, 2L), q.map { it.localId })
    }

    @Test
    fun `a combo from the same sender and gift coalesces into the last pending banner`() {
        var q = enqueueGiftEvent(emptyList(), gift(1, "t1", sender = "a"))
        q = enqueueGiftEvent(q, gift(2, "t2", sender = "b", qty = 2, coins = 20))
        q = enqueueGiftEvent(q, gift(3, "t3", sender = "b", qty = 3, coins = 30))
        assertEquals(2, q.size)
        assertEquals(5, q[1].quantity)
        assertEquals(50, q[1].totalCoins)
        assertEquals(listOf("t2", "t3"), q[1].transactionIds)
    }

    @Test
    fun `the banner already on screen is never mutated by coalescing`() {
        var q = enqueueGiftEvent(emptyList(), gift(1, "t1", sender = "a"))
        q = enqueueGiftEvent(q, gift(2, "t2", sender = "a"))
        assertEquals(2, q.size)
        assertEquals(1, q[0].quantity)
    }

    @Test
    fun `a redelivered transaction id is ignored`() {
        val q = enqueueGiftEvent(emptyList(), gift(1, "t1"))
        assertSame(q, enqueueGiftEvent(q, gift(2, "t1")))
    }

    @Test
    fun `an overflowing queue drops the oldest pending entries but keeps the one on screen`() {
        var q: List<LiveGiftEvent> = emptyList()
        for (i in 1..6) q = enqueueGiftEvent(q, gift(i.toLong(), "t$i", sender = "s$i"), maxQueue = 4)
        assertEquals(listOf(1L, 4L, 5L, 6L), q.map { it.localId })
    }

    @Test
    fun `a backlog shortens each banner`() {
        assertTrue(giftDisplayDurationMillis(10) < giftDisplayDurationMillis(1))
    }

    // ─── Gift idempotency ────────────────────────────────────────────

    @Test
    fun `retrying the same gift after an unknown outcome reuses the idempotency key`() {
        val previous = LiveGiftAttempt("key-1", "rose", 5)
        val next = resolveGiftAttempt(previous, "rose", 5) { "key-2" }
        assertEquals("key-1", next.idempotencyKey)
    }

    @Test
    fun `changing gift or quantity starts a fresh idempotency key`() {
        val previous = LiveGiftAttempt("key-1", "rose", 5)
        assertEquals("key-2", resolveGiftAttempt(previous, "rose", 6) { "key-2" }.idempotencyKey)
        assertEquals("key-3", resolveGiftAttempt(previous, "star", 5) { "key-3" }.idempotencyKey)
        assertEquals("key-4", resolveGiftAttempt(null, "rose", 5) { "key-4" }.idempotencyKey)
    }

    @Test
    fun `affordability uses the real balance and long math`() {
        assertTrue(canAffordGift(balance = 100, priceCoins = 10, quantity = 10))
        assertFalse(canAffordGift(balance = 99, priceCoins = 10, quantity = 10))
        assertFalse(canAffordGift(balance = null, priceCoins = 1, quantity = 1))
        assertFalse(canAffordGift(balance = Int.MAX_VALUE, priceCoins = Int.MAX_VALUE, quantity = 100))
        assertNull(giftTotalCoins(0, 1))
        assertEquals(Int.MAX_VALUE.toLong() * 2, giftTotalCoins(Int.MAX_VALUE, 2))
    }

    @Test
    fun `an untranslated gift key is humanised, not invented`() {
        assertEquals("Rose bouquet", humanizeGiftKey("rose_bouquet"))
        assertEquals("Super star", humanizeGiftKey("super-star"))
        assertEquals("Heart", humanizeGiftKey("heart"))
    }

    // ─── Scheduling ──────────────────────────────────────────────────

    @Test
    fun `a schedule time must be clearly in the future or the server would go live now`() {
        val now = 1_000_000L
        assertTrue(isValidScheduleTime(now + 3_600_000L, now))
        assertFalse(isValidScheduleTime(now + 30_000L, now))
        assertFalse(isValidScheduleTime(now - 1L, now))
    }
}
