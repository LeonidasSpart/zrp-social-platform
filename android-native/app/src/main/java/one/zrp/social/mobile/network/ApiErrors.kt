package one.zrp.social.mobile.network

import com.google.gson.Gson
import retrofit2.HttpException

private val errorGson = Gson()

/**
 * Parses an HttpException's error body ONCE into the shared shape every
 * ZRP API route error uses ({"error", and sometimes "code"/"limit"}).
 * `response()?.errorBody()` returns the same underlying OkHttp
 * ResponseBody/stream every time it's called - reading `.string()` from
 * it a second time does not re-read the real body, so
 * zrpErrorMessage()/zrpErrorCode()/zrpErrorLimit() all delegate to this
 * single parse rather than each calling `.string()` themselves, which
 * would silently break the moment a caller needs more than one of them
 * off the same exception (e.g. RepostFeedback.kt needing both the
 * message and the numeric `limit` for the same 429 response).
 */
fun HttpException.zrpErrorBody(): ApiErrorBody? {
    val body = response()?.errorBody()?.string() ?: return null
    return try {
        errorGson.fromJson(body, ApiErrorBody::class.java)
    } catch (_: Exception) {
        null
    }
}

/**
 * Every ZRP API route that rejects a request returns {"error": "..."}
 * - this pulls that message out of a Retrofit HttpException's body so
 * failures surface the server's own specific message (a plan limit, a
 * rate limit, a validation error) instead of a generic HTTP status.
 */
fun HttpException.zrpErrorMessage(): String? = zrpErrorBody()?.error

// A handful of routes (profile update, onboarding-complete, others
// that call findExistingSessionUser()) also return a machine-readable
// `code` alongside `error` - e.g. ACCOUNT_NOT_FOUND for a session whose
// underlying User row is gone (a signed, self-contained JWT can still
// look "authenticated" after that row is deleted). Callers that need to
// branch on that rather than just display `error` use this.
fun HttpException.zrpErrorCode(): String? = zrpErrorBody()?.code

// Currently only meaningful on POST /posts/{id}/repost's 429 body - see
// RepostFeedback.kt.
fun HttpException.zrpErrorLimit(): Int? = zrpErrorBody()?.limit
