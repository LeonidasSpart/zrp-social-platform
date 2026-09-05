package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.AppNotification

class NotificationsRepository {
    suspend fun getNotifications(): Result<List<AppNotification>> = runCatching {
        ApiClient.notificationsApi.getNotifications()
    }

    suspend fun markAllRead(): Result<Unit> = runCatching {
        ApiClient.notificationsApi.markAllRead()
        Unit
    }
}
