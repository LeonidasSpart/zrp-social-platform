package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.PUT

data class NotificationPostRef(
    val id: String,
    val content: String,
)

data class AppNotification(
    val id: String,
    val type: String,
    val read: Boolean,
    val createdAt: String,
    val fromUser: PostAuthor?,
    val post: NotificationPostRef?,
    // Set only on a "comment"/"reply" notification - the exact comment
    // or reply that triggered it, so a tap can jump straight to it
    // instead of opening the post at the top of its comment list.
    val commentId: String? = null,
)

data class MarkReadResponse(val success: Boolean)

data class UnreadCountResponse(val count: Int)

/**
 * The same real notifications the website's bell icon and
 * /notifications page use - GET /notifications (most recent 50) and
 * PUT /notifications (marks every unread one read, mirroring the
 * website's own "opening the list marks it all read" behavior). No
 * separate mobile notification store.
 */
interface NotificationsApi {
    @GET("notifications")
    suspend fun getNotifications(): List<AppNotification>

    @PUT("notifications")
    suspend fun markAllRead(): MarkReadResponse

    // Backs the bottom nav's unread badge - the same real GET
    // /notifications/unread endpoint, not a count derived from the
    // already-fetched list (which the badge, living outside the
    // Notifications screen's own ViewModel, doesn't have access to).
    @GET("notifications/unread")
    suspend fun getUnreadCount(): UnreadCountResponse
}
