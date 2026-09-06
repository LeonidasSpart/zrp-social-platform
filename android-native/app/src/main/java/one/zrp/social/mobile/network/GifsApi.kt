package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Query

data class GifResult(
    val id: String,
    val url: String,
    val title: String,
    val width: Int? = null,
    val height: Int? = null,
)

data class GifsResponse(val results: List<GifResult> = emptyList())

/**
 * The same real GIF search the website's own GifPicker.tsx uses - both
 * proxy through this backend to Giphy server-side (see the website's
 * /api/gifs/trending and /api/gifs/search routes), never talking to
 * Giphy directly from the client.
 */
interface GifsApi {
    @GET("gifs/trending")
    suspend fun getTrending(): GifsResponse

    @GET("gifs/search")
    suspend fun search(@Query("q") query: String): GifsResponse
}
