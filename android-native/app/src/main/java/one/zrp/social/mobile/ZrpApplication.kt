package one.zrp.social.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.push.ZrpFirebaseMessagingService

class ZrpApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
        createNotificationChannel()
    }

    // Created once at startup rather than lazily when the first push
    // arrives - Android silently drops any notification posted to a
    // channel that doesn't exist yet on API 26+.
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            ZrpFirebaseMessagingService.CHANNEL_ID,
            getString(R.string.notification_channel_general_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
