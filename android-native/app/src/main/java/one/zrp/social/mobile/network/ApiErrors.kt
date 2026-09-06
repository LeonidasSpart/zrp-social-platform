package one.zrp.social.mobile.network

import com.google.gson.Gson
import retrofit2.HttpException

private val errorGson = Gson()

/**
 * Every ZRP API route that rejects a request returns {"error": "..."}
 * - this pulls that message out of a Retrofit HttpException's body so
 * failures surface the server's own specific message (a plan limit, a
 * rate limit, a validation error) instead of a generic HTTP status.
 */
fun HttpException.zrpErrorMessage(): String? {
    val body = response()?.errorBody()?.string() ?: return null
    return try {
        errorGson.fromJson(body, ApiErrorBody::class.java)?.error
    } catch (_: Exception) {
        null
    }
}

// A handful of routes (profile update, onboarding-complete, others
// that call findExistingSessionUser()) also return a machine-readable
// `code` alongside `error` - e.g. ACCOUNT_NOT_FOUND for a session whose
// underlying User row is gone (a signed, self-contained JWT can still
// look "authenticated" after that row is deleted). Callers that need to
// branch on that rather than just display `error` use this.
fun HttpException.zrpErrorCode(): String? {
    val body = response()?.errorBody()?.string() ?: return null
    return try {
        errorGson.fromJson(body, ApiErrorBody::class.java)?.code
    } catch (_: Exception) {
        null
    }
}
