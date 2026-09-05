package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.HTTP
import retrofit2.http.POST

data class FcmTokenRequest(val token: String)
data class FcmTokenResponse(val success: Boolean)

/**
 * Registers/unregisters this device's Firebase Cloud Messaging token
 * against the signed-in ZRP account - the real POST/DELETE
 * /push/fcm endpoints, not a mock. See PushRepository's KDoc for when
 * each is called.
 */
interface PushApi {
    @POST("push/fcm")
    suspend fun registerToken(@Body request: FcmTokenRequest): FcmTokenResponse

    // Retrofit's @DELETE doesn't accept @Body directly (DELETE
    // shouldn't carry one per the HTTP spec, but this endpoint needs
    // the token value to know which row to remove) - @HTTP with
    // hasBody = true is the documented way to send one anyway.
    @HTTP(method = "DELETE", path = "push/fcm", hasBody = true)
    suspend fun unregisterToken(@Body request: FcmTokenRequest): FcmTokenResponse
}
