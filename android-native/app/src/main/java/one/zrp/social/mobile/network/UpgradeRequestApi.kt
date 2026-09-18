package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * A manual, admin-reviewed upgrade request - not a payment. The route
 * (`POST /upgrade-requests`, matching web's UpgradeRequestModal.tsx) only
 * ever writes a row an admin later approves or denies; no money moves
 * through this call or through this app at all, so it is not one of the
 * NativeRestrictedPaymentFeature surfaces src/lib/native-payment-policy.ts
 * blocks natively (that policy's "plan-upgrade" entry is specifically the
 * *automated on-chain* crypto flow web's own CryptoPaymentModal drives,
 * a different route this screen never calls). `requestedPlan` must be one
 * of the route's own accepted values ("pro" | "business" | "enterprise");
 * the server 400s on anything else.
 */
data class CreateUpgradeRequest(
    val requestedPlan: String,
    val paymentMethod: String? = null,
    val message: String? = null,
)

interface UpgradeRequestApi {
    @POST("upgrade-requests")
    suspend fun createUpgradeRequest(@Body request: CreateUpgradeRequest)
}
