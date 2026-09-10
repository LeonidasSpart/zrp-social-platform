package one.zrp.social.mobile.network

import retrofit2.http.GET

data class CharityCommitted(
    val amount: Double,
    val currency: String,
)

data class CharityDisbursementRecord(
    val id: String,
    val beneficiaryName: String,
    val cause: String,
    val amount: Double,
    val currency: String,
    val disbursedAt: String,
    val note: String?,
    val proofUrl: String?,
)

data class CharityDisbursed(
    val total: Double,
    val byCause: Map<String, Double>,
    val records: List<CharityDisbursementRecord>,
)

data class CharityTransparencyResponse(
    val generatedAt: String,
    val committed: CharityCommitted,
    val disbursed: CharityDisbursed,
)

/**
 * The real, public GET /api/transparency/charity route
 * CharityLedger.tsx itself calls - no auth required server-side,
 * matching the real route. Two genuinely different numbers kept
 * separate rather than blended: `committed` is computed automatically
 * from the real charityAmount already recorded on completed Tip/
 * PremiumPurchase transactions (what the 35% policy owes so far, not
 * proof it has been paid out); `disbursed` is the sum of real
 * CharityDisbursement records an admin has entered after ZRP actually
 * sent money to a beneficiary - empty until a real disbursement is
 * recorded, never estimated.
 */
interface CharityApi {
    @GET("transparency/charity")
    suspend fun getCharityTransparency(): CharityTransparencyResponse
}
