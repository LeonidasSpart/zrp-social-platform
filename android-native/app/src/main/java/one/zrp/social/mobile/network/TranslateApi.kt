package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST

data class TranslateRequest(val text: String, val targetLang: String)

data class TranslateResponse(val translatedText: String)

/**
 * The same real MyMemory-backed translation the website's PostCard
 * "Show translation" button calls (POST /api/translate) - requires a
 * signed-in session and is rate-limited server-side (see the route's
 * own security comment), same as the website. targetLang there is the
 * viewer's site-wide UI language preference (useLanguage()); native has
 * no such setting, so PostCard passes the device's own locale language
 * instead - the closest native equivalent of "translate to what I read".
 */
interface TranslateApi {
    @POST("translate")
    suspend fun translate(@Body request: TranslateRequest): TranslateResponse
}
