package one.zrp.social.mobile.data

import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.FcmTokenRequest
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Bridges the device's real Firebase Cloud Messaging registration
 * token to the signed-in ZRP account via the real POST/DELETE
 * /push/fcm endpoints. Registration happens once right after a
 * successful login (see AuthViewModel.login) and again whenever
 * ZrpFirebaseMessagingService.onNewToken fires - FCM can rotate a
 * device's token at any time, independent of the app's own auth
 * state. Unregistration happens on logout (see AuthViewModel.logout)
 * so a signed-out device stops receiving pushes meant for the account
 * that just signed out.
 */
class PushRepository {
    suspend fun fetchCurrentToken(): String = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> continuation.resume(token) }
            .addOnFailureListener { error -> continuation.resumeWithException(error) }
    }

    suspend fun registerToken(token: String) {
        ApiClient.pushApi.registerToken(FcmTokenRequest(token))
    }

    suspend fun registerCurrentToken() {
        registerToken(fetchCurrentToken())
    }

    suspend fun unregisterToken(token: String) {
        ApiClient.pushApi.unregisterToken(FcmTokenRequest(token))
    }
}
