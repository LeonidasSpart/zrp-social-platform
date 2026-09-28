package one.zrp.social.mobile.ui.play

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Regression coverage for the "trending challenge renders blank" bug:
 * the server (src/lib/play/registry.ts) has 5 real game types, but this
 * app only ever had a player view for 3 (TRIVIA/MEMORY/LOGIC).
 * filterPlayableChallenges() is what PlayViewModel's trending grid uses
 * so a REACTION/SEQUENCE challenge - fully playable on web/iOS - can
 * never be tapped into a blank screen from browsing on Android.
 */
class PlayFormattingTest {

    @Test
    fun `keeps only the types this app has a player view for`() {
        val types = listOf("TRIVIA", "MEMORY", "LOGIC", "REACTION", "SEQUENCE")

        val result = filterPlayableChallenges(types) { it }

        assertEquals(listOf("TRIVIA", "MEMORY", "LOGIC"), result)
    }

    @Test
    fun `an all-unsupported list filters down to empty, not a crash`() {
        assertEquals(emptyList<String>(), filterPlayableChallenges(listOf("REACTION", "SEQUENCE")) { it })
    }

    @Test
    fun `an all-supported list passes through unchanged, same order`() {
        val types = listOf("LOGIC", "TRIVIA", "MEMORY")
        assertEquals(types, filterPlayableChallenges(types) { it })
    }

    @Test
    fun `an empty input produces an empty output`() {
        assertEquals(emptyList<String>(), filterPlayableChallenges(emptyList<String>()) { it })
    }

    @Test
    fun `an unrecognized future type is treated as unsupported, not let through`() {
        // Fail-closed: a brand new server game type this app has never
        // heard of must not be assumed playable just because it isn't
        // one of the two known-unsupported ones.
        assertEquals(emptyList<String>(), filterPlayableChallenges(listOf("SOME_FUTURE_TYPE")) { it })
    }
}
