package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * ZRP Launchpad - the same real src/app/api/launchpad/* routes the
 * website's Launchpad pages use. Every mutation here only ever reports an
 * already-broadcast, already-confirmed on-chain transaction signature for
 * independent server-side re-verification (see zrp-launch-service.ts on
 * the web repo) - this app never asks the backend to sign or trust a
 * client-claimed amount/price/success.
 */

data class LaunchpadCreator(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class LaunchedTokenSummary(
    val id: String,
    val mintAddress: String?,
    val name: String,
    val symbol: String,
    val description: String?,
    val imageUrl: String,
    val supply: String?,
    val decimals: Int?,
    val revokeMint: Boolean,
    val revokeFreeze: Boolean,
    val revokeUpdate: Boolean,
    val createdAt: String,
    val creator: LaunchpadCreator?,
    val activePoolCount: Int = 0,
)

data class LaunchedTokenDetail(
    val id: String,
    val mintAddress: String?,
    val venue: String,
    val name: String,
    val symbol: String,
    val description: String?,
    val imageUrl: String,
    val website: String?,
    val twitter: String?,
    val telegram: String?,
    val discord: String?,
    val supply: String?,
    val decimals: Int?,
    val revokeMint: Boolean,
    val revokeFreeze: Boolean,
    val revokeUpdate: Boolean,
    val status: String,
    val mintTransactionId: String?,
    val createdAt: String,
    val creator: LaunchpadCreator?,
)

data class LaunchedTokensPage(
    val tokens: List<LaunchedTokenSummary>,
    val nextCursor: String?,
)

data class LaunchedTokenResponse(val token: LaunchedTokenDetail)

data class CurveState(
    val status: String, // "OK" | "NO_CURVE" | "UNAVAILABLE"
    val reason: String?,
    val bondingCurveAddress: String?,
    val graduated: Boolean?,
    val virtualTokenReservesRaw: String?,
    val virtualQuoteLamports: String?,
    val realTokenReservesRaw: String?,
    val realQuoteLamports: String?,
    val priceQuoteLamports: String?,
    val priceTokenRaw: String?,
    val priceDisplay: String?,
    val progressBps: Int?,
    val marketCapLamports: String?,
    val tokenTotalSupplyRaw: String?,
)

data class CurveQuote(
    val status: String,
    val reason: String?,
    val tokenAmountRaw: String?,
    val solAmountLamports: String?,
    val protocolFeeLamports: String?,
    val creatorFeeLamports: String?,
    val totalFeeLamports: String?,
    val minimumReceivedRaw: String?,
)

data class CurveResponse(
    val curve: CurveState,
    val quote: CurveQuote?,
    val venue: String,
)

data class TopHolder(val owner: String, val amountRaw: String, val percent: Double)
data class HolderCountStatus(val status: String, val reason: String?)
data class HoldersResponse(
    val status: String,
    val topOwners: List<TopHolder> = emptyList(),
    val top10ConcentrationPercent: Double = 0.0,
    val top20ConcentrationPercent: Double = 0.0,
    val totalHolderCount: HolderCountStatus? = null,
    val excludedAddresses: List<String> = emptyList(),
    val reason: String? = null,
)

/** POST /api/launchpad/zrp/create body - see src/app/api/launchpad/zrp/create/route.ts. */
data class ZrpCreateTokenRequest(
    val name: String,
    val symbol: String,
    val description: String?,
    val imageUrl: String,
    val website: String?,
    val twitter: String?,
    val telegram: String?,
    val discord: String?,
    val mintAddress: String,
    val walletAddress: String,
    val transactionId: String,
)

data class ZrpCreateTokenResponse(val success: Boolean, val token: LaunchedTokenDetail)

/** POST /api/launchpad/curve/buy and /sell share this exact body shape. */
data class CurveTradeRequest(
    val mintAddress: String,
    val walletAddress: String,
    val transactionId: String,
)

data class TokenTrade(
    val id: String,
    val mintAddress: String,
    val txSignature: String,
    val side: String,
    val baseAmountRaw: String,
    val quoteAmountRaw: String,
    val walletAddress: String,
)

data class CurveTradeResponse(val trade: TokenTrade)

interface LaunchpadApi {
    @GET("launchpad/tokens")
    suspend fun getTokens(
        @Query("cursor") cursor: String?,
        @Query("hasPool") hasPool: String? = null,
        @Query("graduated") graduated: String? = null,
    ): LaunchedTokensPage

    @GET("launchpad/tokens/{mint}")
    suspend fun getToken(@Path("mint") mint: String): LaunchedTokenResponse

    @GET("launchpad/tokens/{mint}/curve")
    suspend fun getCurve(
        @Path("mint") mint: String,
        @Query("side") side: String? = null,
        @Query("amount") amount: String? = null,
        @Query("slippageBps") slippageBps: Int? = null,
    ): CurveResponse

    @GET("launchpad/tokens/{mint}/holders")
    suspend fun getHolders(@Path("mint") mint: String): HoldersResponse

    @POST("launchpad/zrp/create")
    suspend fun recordZrpTokenCreation(@Body body: ZrpCreateTokenRequest): ZrpCreateTokenResponse

    @POST("launchpad/curve/buy")
    suspend fun recordCurveBuy(@Body body: CurveTradeRequest): CurveTradeResponse

    @POST("launchpad/curve/sell")
    suspend fun recordCurveSell(@Body body: CurveTradeRequest): CurveTradeResponse
}
