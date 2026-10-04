package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CurveResponse
import one.zrp.social.mobile.network.CurveTradeRequest
import one.zrp.social.mobile.network.CurveTradeResponse
import one.zrp.social.mobile.network.HoldersResponse
import one.zrp.social.mobile.network.LaunchedTokenDetail
import one.zrp.social.mobile.network.LaunchedTokensPage
import one.zrp.social.mobile.network.ZrpCreateTokenRequest
import one.zrp.social.mobile.network.ZrpCreateTokenResponse
import one.zrp.social.mobile.network.ZrpGlobalConfigResponse

/**
 * ZRP Launchpad - real browsing/discovery plus reporting already-broadcast,
 * already-confirmed on-chain transactions for independent server-side
 * verification. This repository never signs anything and never trusts a
 * client-side "it worked" - every write here hands the backend a
 * transaction signature it re-derives the real outcome from on-chain
 * (see zrp-launch-service.ts on the web repo).
 */
class LaunchpadRepository {
    suspend fun getRecentBlockhash(): Result<String> = runCatching {
        ApiClient.launchpadApi.getBlockhash().blockhash
    }

    suspend fun getZrpGlobalConfig(): Result<ZrpGlobalConfigResponse> = runCatching {
        ApiClient.launchpadApi.getZrpGlobalConfig()
    }

    suspend fun getTokens(
        cursor: String? = null,
        hasPool: Boolean = false,
        graduated: Boolean? = null,
    ): Result<LaunchedTokensPage> = runCatching {
        ApiClient.launchpadApi.getTokens(
            cursor = cursor,
            hasPool = if (hasPool) "1" else null,
            graduated = when (graduated) {
                true -> "1"
                false -> "0"
                null -> null
            },
        )
    }

    suspend fun getToken(mint: String): Result<LaunchedTokenDetail> = runCatching {
        ApiClient.launchpadApi.getToken(mint).token
    }

    suspend fun getCurve(mint: String): Result<CurveResponse> = runCatching {
        ApiClient.launchpadApi.getCurve(mint)
    }

    /** amountRaw is lamports for a buy quote, raw token units for a sell quote - matches GET .../curve's own contract. */
    suspend fun getCurveQuote(mint: String, side: TradeSide, amountRaw: String, slippageBps: Int): Result<CurveResponse> = runCatching {
        ApiClient.launchpadApi.getCurve(
            mint = mint,
            side = if (side == TradeSide.BUY) "buy" else "sell",
            amount = amountRaw,
            slippageBps = slippageBps,
        )
    }

    suspend fun getHolders(mint: String): Result<HoldersResponse> = runCatching {
        ApiClient.launchpadApi.getHolders(mint)
    }

    suspend fun recordTokenCreation(
        name: String,
        symbol: String,
        description: String?,
        imageUrl: String,
        website: String?,
        twitter: String?,
        telegram: String?,
        discord: String?,
        mintAddress: String,
        walletAddress: String,
        transactionId: String,
    ): Result<ZrpCreateTokenResponse> = runCatching {
        ApiClient.launchpadApi.recordZrpTokenCreation(
            ZrpCreateTokenRequest(
                name = name,
                symbol = symbol,
                description = description,
                imageUrl = imageUrl,
                website = website,
                twitter = twitter,
                telegram = telegram,
                discord = discord,
                mintAddress = mintAddress,
                walletAddress = walletAddress,
                transactionId = transactionId,
            )
        )
    }

    suspend fun recordBuy(mintAddress: String, walletAddress: String, transactionId: String): Result<CurveTradeResponse> = runCatching {
        ApiClient.launchpadApi.recordCurveBuy(CurveTradeRequest(mintAddress, walletAddress, transactionId))
    }

    suspend fun recordSell(mintAddress: String, walletAddress: String, transactionId: String): Result<CurveTradeResponse> = runCatching {
        ApiClient.launchpadApi.recordCurveSell(CurveTradeRequest(mintAddress, walletAddress, transactionId))
    }
}

enum class TradeSide { BUY, SELL }
