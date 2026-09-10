package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ModerationTransparencyResponse

class TransparencyRepository {
    suspend fun getModerationTransparency(): Result<ModerationTransparencyResponse> = runCatching {
        ApiClient.transparencyApi.getModerationTransparency()
    }
}
