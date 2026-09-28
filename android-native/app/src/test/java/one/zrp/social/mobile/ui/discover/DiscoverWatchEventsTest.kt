package one.zrp.social.mobile.ui.discover

import one.zrp.social.mobile.network.DiscoverEventType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for Discover's watch-event pipeline: the "no real
 * Discover feed at all" gap this session closes. These are a direct
 * Kotlin port of src/lib/discover-watch-client.ts's own pure logic
 * (same thresholds, same dedup semantics) - see DiscoverWatchEvents.kt's
 * own KDoc for why this decision lives separately from the actual
 * network call.
 */
class DiscoverWatchEventsTest {

    @Test
    fun `no progress events fire before the first threshold`() {
        assertEquals(emptyList<DiscoverEventType>(), getProgressEventsToFire(1000, 10_000, emptySet()))
    }

    @Test
    fun `crossing 25 percent fires exactly PROGRESS_25`() {
        assertEquals(listOf(DiscoverEventType.PROGRESS_25), getProgressEventsToFire(2_500, 10_000, emptySet()))
    }

    @Test
    fun `a big jump fires every threshold crossed at once, in order`() {
        assertEquals(
            listOf(DiscoverEventType.PROGRESS_25, DiscoverEventType.PROGRESS_50, DiscoverEventType.PROGRESS_75),
            getProgressEventsToFire(8_000, 10_000, emptySet()),
        )
    }

    @Test
    fun `an already-fired threshold never fires again`() {
        val fired = setOf(DiscoverEventType.PROGRESS_25, DiscoverEventType.PROGRESS_50)
        assertEquals(listOf(DiscoverEventType.PROGRESS_75), getProgressEventsToFire(8_000, 10_000, fired))
    }

    @Test
    fun `reaching 98 percent of duration fires COMPLETE`() {
        assertTrue(DiscoverEventType.COMPLETE in getProgressEventsToFire(9_800, 10_000, emptySet()))
    }

    @Test
    fun `just under the complete threshold does not fire COMPLETE`() {
        assertFalse(DiscoverEventType.COMPLETE in getProgressEventsToFire(9_700, 10_000, emptySet()))
    }

    @Test
    fun `a non-positive duration produces no events`() {
        assertEquals(emptyList<DiscoverEventType>(), getProgressEventsToFire(5_000, 0, emptySet()))
        assertEquals(emptyList<DiscoverEventType>(), getProgressEventsToFire(5_000, -1, emptySet()))
    }

    @Test
    fun `a negative position produces no events`() {
        assertEquals(emptyList<DiscoverEventType>(), getProgressEventsToFire(-1, 10_000, emptySet()))
    }

    @Test
    fun `SKIP fires only once playback actually started`() {
        assertFalse(shouldFireSkip(emptySet()))
        assertTrue(shouldFireSkip(setOf(DiscoverEventType.START)))
    }

    @Test
    fun `SKIP never fires for a post that already completed`() {
        assertFalse(shouldFireSkip(setOf(DiscoverEventType.START, DiscoverEventType.COMPLETE)))
    }

    @Test
    fun `SKIP never fires twice for the same post`() {
        assertFalse(shouldFireSkip(setOf(DiscoverEventType.START, DiscoverEventType.SKIP)))
    }

    @Test
    fun `IMPRESSION fires once per post per session`() {
        assertTrue(shouldFireImpression(emptySet()))
        assertFalse(shouldFireImpression(setOf(DiscoverEventType.IMPRESSION)))
    }

    @Test
    fun `START fires once per post per session`() {
        assertTrue(shouldFireStart(emptySet()))
        assertFalse(shouldFireStart(setOf(DiscoverEventType.START)))
    }
}
