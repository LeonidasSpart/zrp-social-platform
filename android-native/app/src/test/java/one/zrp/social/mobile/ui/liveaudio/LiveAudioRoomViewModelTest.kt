package one.zrp.social.mobile.ui.liveaudio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-function coverage for LiveAudioRoomViewModel's role/queue logic -
 * see src/lib/live-audio/room-service.ts's own canPromoteSpeaker/
 * isRoomAuthority checks, which these mirror.
 */
class LiveAudioRoomViewModelTest {

    @Test
    fun `HOST MODERATOR and SPEAKER can publish audio`() {
        assertTrue(canPublishLiveAudio("HOST"))
        assertTrue(canPublishLiveAudio("MODERATOR"))
        assertTrue(canPublishLiveAudio("SPEAKER"))
    }

    @Test
    fun `LISTENER and null cannot publish audio`() {
        assertFalse(canPublishLiveAudio("LISTENER"))
        assertFalse(canPublishLiveAudio(null))
    }

    @Test
    fun `only HOST and MODERATOR are room authority`() {
        assertTrue(isLiveAudioAuthority("HOST"))
        assertTrue(isLiveAudioAuthority("MODERATOR"))
        assertFalse(isLiveAudioAuthority("SPEAKER"))
        assertFalse(isLiveAudioAuthority("LISTENER"))
        assertFalse(isLiveAudioAuthority(null))
    }

    @Test
    fun `addPendingSpeakerRequest appends a new requester`() {
        assertEquals(listOf("u1", "u2"), addPendingSpeakerRequest(listOf("u1"), "u2"))
    }

    @Test
    fun `addPendingSpeakerRequest does not duplicate an existing requester`() {
        assertEquals(listOf("u1", "u2"), addPendingSpeakerRequest(listOf("u1", "u2"), "u2"))
    }

    @Test
    fun `removePendingSpeakerRequest drops only the resolved requester`() {
        assertEquals(listOf("u1", "u3"), removePendingSpeakerRequest(listOf("u1", "u2", "u3"), "u2"))
    }

    @Test
    fun `removePendingSpeakerRequest is a no-op for an unknown id`() {
        assertEquals(listOf("u1"), removePendingSpeakerRequest(listOf("u1"), "u9"))
    }
}
