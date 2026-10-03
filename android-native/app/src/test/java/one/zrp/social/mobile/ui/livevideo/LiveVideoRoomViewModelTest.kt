package one.zrp.social.mobile.ui.livevideo

import one.zrp.social.mobile.network.LiveAudioHost
import one.zrp.social.mobile.network.LiveVideoParticipant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure-function coverage for LiveVideoRoomViewModel's role and stage-selection logic. */
class LiveVideoRoomViewModelTest {

    private fun participant(id: String, role: String) = LiveVideoParticipant(
        role = role,
        isMuted = false,
        isCameraOff = false,
        joinedAt = "2026-10-03T12:00:00.000Z",
        user = LiveAudioHost(id = id, username = id, name = null, avatarUrl = null, badgeType = null),
    )

    @Test
    fun `publishers are HOST MODERATOR and SPEAKER, same ladder as Live Audio`() {
        assertTrue(canPublishLiveVideo("HOST"))
        assertTrue(canPublishLiveVideo("MODERATOR"))
        assertTrue(canPublishLiveVideo("SPEAKER"))
        assertFalse(canPublishLiveVideo("LISTENER"))
        assertFalse(canPublishLiveVideo(null))
    }

    @Test
    fun `only HOST and MODERATOR have room authority`() {
        assertTrue(isLiveVideoAuthority("HOST"))
        assertTrue(isLiveVideoAuthority("MODERATOR"))
        assertFalse(isLiveVideoAuthority("SPEAKER"))
        assertFalse(isLiveVideoAuthority("LISTENER"))
    }

    @Test
    fun `the host gets the stage when present`() {
        val list = listOf(participant("g1", "SPEAKER"), participant("h", "HOST"), participant("v", "LISTENER"))
        assertEquals("h", pickStageUserId(list, hostId = "h"))
    }

    @Test
    fun `without the host, the first publisher gets the stage - never a viewer`() {
        val list = listOf(participant("v", "LISTENER"), participant("g1", "SPEAKER"), participant("g2", "MODERATOR"))
        assertEquals("g1", pickStageUserId(list, hostId = "h"))
    }

    @Test
    fun `no publishers means no stage tile`() {
        assertNull(pickStageUserId(listOf(participant("v", "LISTENER")), hostId = "h"))
        assertNull(pickStageUserId(emptyList(), hostId = null))
    }
}
