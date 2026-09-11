package one.zrp.social.mobile.ui.messages

import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.GroupConversationSummary
import one.zrp.social.mobile.network.PostAuthor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the conversation-list "Delete conversation"
 * fix: [conversationsAfterDirectDelete] is the one filter rule shared by
 * both places a direct conversation can disappear from this screen's
 * list (a delete initiated from this device, and the "conversation-
 * deleted" relay for one deleted elsewhere - see MessagesViewModel's own
 * KDoc), pulled out as a pure function specifically so it has real JUnit
 * coverage without needing to fake ApiClient's network singleton or a
 * live Socket.IO connection, neither of which this module has a test
 * seam for yet (see PollMathTest.kt for the same "pure function,
 * JUnit-only" pattern already established in this app).
 */
class MessagesViewModelTest {

    private fun samplePartner(id: String, username: String) =
        PostAuthor(id = id, username = username, name = null, avatarUrl = null, badgeType = null)

    private fun sampleMessage(senderId: String) = ChatMessage(
        id = "msg-$senderId",
        content = "hello",
        imageUrl = null,
        senderId = senderId,
        receiverId = "me",
        read = true,
        edited = false,
        createdAt = "2026-09-11T10:00:00.000Z",
        sender = null,
        receiver = null,
        replyTo = null,
    )

    private fun directItem(partnerId: String, username: String = partnerId) = ConversationListItem.Direct(
        ConversationSummary(
            partner = samplePartner(partnerId, username),
            lastMessage = sampleMessage(partnerId),
            unreadCount = 0,
        ),
    )

    private fun groupItem(id: String) = ConversationListItem.Group(
        GroupConversationSummary(
            id = id,
            name = "Group $id",
            avatarUrl = null,
            participantCount = 3,
            lastMessage = null,
            unreadCount = 0,
        ),
    )

    @Test
    fun `removes only the direct conversation matching the given partner id`() {
        val items = listOf(directItem("alice"), directItem("bob"), groupItem("g1"))

        val result = conversationsAfterDirectDelete(items, partnerId = "alice")

        assertEquals(listOf("bob"), result.filterIsInstance<ConversationListItem.Direct>().map { it.summary.partner.id })
        assertEquals(1, result.filterIsInstance<ConversationListItem.Group>().size)
    }

    @Test
    fun `never removes a group conversation, even one that happens to share the deleted partner's id as its own id`() {
        // A direct partner's userId and a group's conversationId are
        // different id spaces server-side, but this proves the filter
        // itself keys off ConversationListItem.Direct specifically, not
        // a bare id match that could ever touch a group row.
        val items = listOf(directItem("shared-id"), groupItem("shared-id"))

        val result = conversationsAfterDirectDelete(items, partnerId = "shared-id")

        assertTrue(result.filterIsInstance<ConversationListItem.Direct>().isEmpty())
        assertEquals(1, result.filterIsInstance<ConversationListItem.Group>().size)
    }

    @Test
    fun `deleting a partner not in the list is a no-op, not an error`() {
        val items = listOf(directItem("alice"), groupItem("g1"))

        val result = conversationsAfterDirectDelete(items, partnerId = "does-not-exist")

        assertEquals(items, result)
    }

    @Test
    fun `an empty list stays empty`() {
        assertEquals(emptyList<ConversationListItem>(), conversationsAfterDirectDelete(emptyList(), partnerId = "alice"))
    }
}
