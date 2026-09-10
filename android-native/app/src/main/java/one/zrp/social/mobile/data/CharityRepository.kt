package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CharityTransparencyResponse

class CharityRepository {
    suspend fun getCharityTransparency(): Result<CharityTransparencyResponse> = runCatching {
        ApiClient.charityApi.getCharityTransparency()
    }
}
