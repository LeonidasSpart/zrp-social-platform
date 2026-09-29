package one.zrp.social.mobile.ui.messages

import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.GroupConversationSummary
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.SocketGroupMessagePreview
import one.zrp.social.mobile.network.SocketMessagePreview
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

    // ---- applyIncomingDirectMessage / applyOutgoingDirectMessage / applyIncomingGroupMessage ----
    //
    // Regression coverage for the "conversation list goes stale while
    // sitting on the tab" fix (Task #4 parity audit, Messaging/Realtime
    // cluster): MessagesViewModel previously never listened to
    // receive-message/message-sent/receive-group-message at all, unlike
    // web's useConversationList.ts. Pulled out as pure functions for the
    // same JUnit-only reason as conversationsAfterDirectDelete above.

    private fun directPreview(senderId: String, receiverId: String = "me", id: String = "new-msg") =
        SocketMessagePreview(id = id, senderId = senderId, receiverId = receiverId, content = "hi", createdAt = "2026-09-29T12:00:00.000Z", read = false)

    private fun groupPreview(conversationId: String, senderId: String = "alice", id: String = "new-msg") =
        SocketGroupMessagePreview(id = id, senderId = senderId, conversationId = conversationId, content = "hi", createdAt = "2026-09-29T12:00:00.000Z", read = false)

    @Test
    fun `an incoming message updates the matching partner's preview, bumps unread, and re-sorts to the top`() {
        val items = listOf(directItem("alice"), directItem("bob"), groupItem("g1"))

        val result = applyIncomingDirectMessage(items, directPreview(senderId = "bob"))

        val bobRow = result.filterIsInstance<ConversationListItem.Direct>().first { it.summary.partner.id == "bob" }
        assertEquals("new-msg", bobRow.summary.lastMessage.id)
        assertEquals(1, bobRow.summary.unreadCount)
        assertEquals("bob", (result.first() as ConversationListItem.Direct).summary.partner.id)
    }

    @Test
    fun `an incoming message from a partner with no existing row leaves the list untouched`() {
        val items = listOf(directItem("alice"))

        val result = applyIncomingDirectMessage(items, directPreview(senderId = "stranger"))

        assertEquals(items, result)
    }

    @Test
    fun `an outgoing message updates the recipient's preview without touching unread count`() {
        val items = listOf(directItem("alice"))

        val result = applyOutgoingDirectMessage(items, directPreview(senderId = "me", receiverId = "alice"))

        val aliceRow = result.filterIsInstance<ConversationListItem.Direct>().first()
        assertEquals("new-msg", aliceRow.summary.lastMessage.id)
        assertEquals(0, aliceRow.summary.unreadCount)
    }

    @Test
    fun `an incoming group message updates the matching group's preview and bumps unread`() {
        val items = listOf(directItem("alice"), groupItem("g1"), groupItem("g2"))

        val result = applyIncomingGroupMessage(items, groupPreview(conversationId = "g2"))

        val g2Row = result.filterIsInstance<ConversationListItem.Group>().first { it.summary.id == "g2" }
        assertEquals("new-msg", g2Row.summary.lastMessage?.id)
        assertEquals(1, g2Row.summary.unreadCount)
    }

    @Test
    fun `an incoming group message for an unknown conversation leaves the list untouched`() {
        val items = listOf(groupItem("g1"))

        val result = applyIncomingGroupMessage(items, groupPreview(conversationId = "unknown-group"))

        assertEquals(items, result)
    }
}
