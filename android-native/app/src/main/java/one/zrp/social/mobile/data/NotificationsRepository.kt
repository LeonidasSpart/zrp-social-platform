package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.AppNotification
import one.zrp.social.mobile.network.FollowToggleResponse

class NotificationsRepository {
    suspend fun getNotifications(): Result<List<AppNotification>> = runCatching {
        ApiClient.notificationsApi.getNotifications()
    }

    suspend fun markAllRead(): Result<Unit> = runCatching {
        ApiClient.notificationsApi.markAllRead()
        Unit
    }

    // The website's own "Follow back" button posts {action: "follow"}
    // to this same endpoint, but the route (src/app/api/users/
    // [username]/follow/route.ts) never reads that field - it's a pure
    // toggle either way, the same one every other follow button in this
    // app already calls.
    suspend fun toggleFollow(username: String): Result<FollowToggleResponse> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
    }
}
