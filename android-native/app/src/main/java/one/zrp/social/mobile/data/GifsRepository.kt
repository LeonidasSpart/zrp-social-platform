package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.GifResult
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around GifsApi for the post composer's GIF picker - the
 * same real, backend-proxied Giphy trending/search endpoints the
 * website's own GifPicker.tsx calls.
 */
class GifsRepository {
    suspend fun getTrending(): Result<List<GifResult>> = safeCall("Couldn't load GIFs. Try again later.") {
        ApiClient.gifsApi.getTrending().results
    }

    suspend fun search(query: String): Result<List<GifResult>> =
        safeCall("Couldn't search GIFs. Try again later.") {
            ApiClient.gifsApi.search(query).results
        }

    private suspend fun <T> safeCall(genericError: String, block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: genericError))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
