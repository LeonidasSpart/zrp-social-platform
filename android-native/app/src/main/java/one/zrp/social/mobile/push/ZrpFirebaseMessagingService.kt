package one.zrp.social.mobile.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import one.zrp.social.mobile.MainActivity
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PushRepository
import one.zrp.social.mobile.network.ApiClient

/**
 * Receives real Firebase Cloud Messaging pushes and displays them as
 * native Android notifications - no fake/local-only notifications, and
 * no separate polling path (this is push, delivered by the OS itself
 * whenever the server side sends via its Firebase service-account
 * credential; see src/lib/fcm.ts on the web repo). The default
 * notification channel ("zrp_general") is created once in
 * ZrpApplication.onCreate() rather than lazily here, since Android
 * requires a channel to exist before any notification posted to it
 * will show.
 */
class ZrpFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)

        // Fires independently of the app's own UI/auth state - a fresh
        // install's very first token, generated before anyone has
        // logged in, has no authenticated account to attach to yet.
        // AuthViewModel.login registers the token once sign-in succeeds.
        if (ApiClient.getTokenStore().getSessionToken() == null) return

        CoroutineScope(Dispatchers.IO).launch {
            try {
                PushRepository().registerToken(token)
            } catch (_: Exception) {
                // Best-effort: the next app open re-derives and
                // re-registers the current token anyway.
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title ?: message.data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data["body"] ?: return

        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        // Requested at runtime from MainActivity once signed in, but a
        // push can in principle arrive before that prompt is answered
        // (or after it's denied) - NotificationManagerCompat.notify
        // throws a SecurityException on API 33+ without this check
        // rather than just silently no-opping.
        val hasPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (hasPermission) {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), notification)
        }
    }

    companion object {
        // Matches R.string.default_notification_channel_id and the
        // channel ZrpApplication creates at startup.
        const val CHANNEL_ID = "zrp_general"
    }
}
