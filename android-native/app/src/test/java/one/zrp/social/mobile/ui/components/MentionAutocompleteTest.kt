package one.zrp.social.mobile.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Regression coverage for the "no @mention autocomplete at all on
 * Android" gap: the post composer had no way to look up a user while
 * typing "@something", unlike web's PostComposer.tsx (via
 * MentionAutocomplete.tsx). These two pure functions are what
 * CreatePostViewModel/CreatePostScreen use to detect an in-progress
 * mention and to splice the picked username back into the text -
 * mirroring MentionAutocomplete.tsx's own `/@(\w*)$/` detection and
 * PostComposer.tsx's own handleMentionSelect splice exactly.
 */
class MentionAutocompleteTest {

    @Test
    fun `mid-word mention with cursor right after it is detected`() {
        assertEquals("al", findMentionQuery("hey @al", 7))
    }

    @Test
    fun `an empty mention right after the at-sign is still detected`() {
        assertEquals("", findMentionQuery("hey @", 5))
    }

    @Test
    fun `a finished mention followed by a space is not an active query`() {
        assertNull(findMentionQuery("hey @alice ", 11))
    }

    @Test
    fun `no at-sign at all means no query`() {
        assertNull(findMentionQuery("just plain text", 16))
    }

    @Test
    fun `the cursor sitting earlier in the text only looks at text before it`() {
        // Cursor placed right after "@al" even though more text follows -
        // matches web's own textBeforeCursor slice, not the whole string.
        assertEquals("al", findMentionQuery("hey @alice, how are you", 7))
    }

    @Test
    fun `an email-like at-sign with no word chars before the cursor position still matches its own token`() {
        assertEquals("b", findMentionQuery("a@b", 3))
    }

    @Test
    fun `selecting a mention splices in the full username with a trailing space`() {
        val (text, cursor) = applyMentionSelection("hey @al", 7, "alice")
        assertEquals("hey @alice ", text)
        assertEquals(11, cursor)
    }

    @Test
    fun `selecting a mention preserves text typed after the cursor`() {
        val (text, cursor) = applyMentionSelection("hey @al, nice to meet you", 7, "alice")
        assertEquals("hey @alice , nice to meet you", text)
        assertEquals(11, cursor)
    }

    @Test
    fun `selecting a mention for an empty partial still inserts correctly`() {
        val (text, cursor) = applyMentionSelection("hey @", 5, "alice")
        assertEquals("hey @alice ", text)
        assertEquals(11, cursor)
    }

    @Test
    fun `a cursor with no mention token before it leaves the text unchanged`() {
        val (text, cursor) = applyMentionSelection("just plain text", 16, "alice")
        assertEquals("just plain text", text)
        assertEquals(16, cursor)
    }
}
