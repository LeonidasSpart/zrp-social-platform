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
)

data class MarkReadResponse(val success: Boolean)

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
}
