package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AdActionRequest
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ServedAd

/**
 * Backs the home feed's single sponsored-post slot - stateless, the
 * same way LinkPreviewRepository/PostViewRepository are, since nothing
 * here mutates a ViewModel's post list.
 */
class AdsRepository {
    // A failed/empty response is invisible to the user - no ad shown -
    // matching the real route's own catch block (it responds {ad: null}
    // on any server error rather than a non-200 status), never a reason
    // to surface an error on the whole feed.
    suspend fun serveAd(): ServedAd? = runCatching { ApiClient.adsApi.serveAd().ad }.getOrNull()

    suspend fun logImpression(campaignId: String) {
        runCatching { ApiClient.adsApi.logImpression(AdActionRequest(campaignId)) }
    }

    // Null on failure - the caller falls back to the ad's own post
    // permalink, the same fallback the real route itself already
    // applies server-side when there's no redirectUrl (see click/
    // route.ts) for the success case.
    suspend fun logClick(campaignId: String): String? =
        runCatching { ApiClient.adsApi.logClick(AdActionRequest(campaignId)).redirectUrl }.getOrNull()
}
