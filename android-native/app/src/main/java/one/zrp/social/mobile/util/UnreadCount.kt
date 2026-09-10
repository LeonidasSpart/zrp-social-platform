package one.zrp.social.mobile.util

import one.zrp.social.mobile.network.GroupConversationSummary

/**
 * The real GET /api/messages/unread endpoint counts only rows with a
 * non-null receiverId (see its own route KDoc) - a real GROUP message
 * always has receiverId null (Conversation's own KDoc), so that count
 * structurally excludes every group conversation's unread messages.
 * There is no single server endpoint that already sums both, so the
 * nav badge does it here from the two real numbers it already has:
 * the 1:1 total (GET /messages/unread) plus each real group's own
 * unreadCount (GET /conversations, the same figure MessagesScreen's
 * own group rows render). Not a client-side invention of a count that
 * doesn't otherwise exist - both inputs are real, already-fetched
 * server totals, just never summed server-side.
 */
fun aggregateUnreadCount(directUnreadTotal: Int, groupConversations: List<GroupConversationSummary>): Int =
    directUnreadTotal + groupConversations.sumOf { it.unreadCount }
