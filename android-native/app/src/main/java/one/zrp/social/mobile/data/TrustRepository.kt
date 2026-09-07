package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.TrustPassportResponse

class TrustRepository {
    suspend fun getTrustPassport(username: String): Result<TrustPassportResponse> = runCatching {
        ApiClient.trustApi.getTrustPassport(username)
    }
}
