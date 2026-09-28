package one.zrp.social.mobile.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.zrpErrorBody
import retrofit2.HttpException

/**
 * Why a repost toggle was refused, classified from the real server
 * response so the screen can show a specific, translated message
 * instead of silently rolling the optimistic toggle back (which is
 * what every feed surface did before: the green highlight flashed on
 * and off with no explanation at all).
 *
 * POST /api/posts/{id}/repost answers 403 in two real cases (see
 * src/app/api/posts/[id]/repost/route.ts): the post belongs to a
 * private account the caller doesn't own, or the post is otherwise not
 * repostable (e.g. still scheduled). It also answers 429 with a real,
 * plan-specific daily-quota message (`reserveRepost`/repostsPerDay) -
 * that case used to fall through to the generic failure below,
 * indistinguishable from a random network error, even though the server
 * told the client exactly what happened and when to try again.
 * Everything else - network, 5xx - is still a generic failure.
 *
 * ViewModels have no Context to resolve a string with (see
 * util/LocalizedError.kt), so they hold this data class and the
 * Composable render site maps it to the real string resource via
 * [repostFailureMessage].
 */
enum class RepostFailure { PRIVATE_ACCOUNT, FORBIDDEN, RATE_LIMITED, GENERIC }

/**
 * [limit] is only ever set for [RepostFailure.RATE_LIMITED] (the 429's
 * own `limit` field - see ApiErrorBody) - it's a plan-specific number,
 * so it's carried separately rather than just re-displaying the
 * server's own English sentence, which would bypass this app's
 * localization for every non-English viewer.
 */
data class RepostFailureInfo(val kind: RepostFailure, val limit: Int? = null)

fun Throwable.toRepostFailure(): RepostFailureInfo {
    val http = this as? HttpException ?: return RepostFailureInfo(RepostFailure.GENERIC)
    // Single parse of the error body - see zrpErrorBody()'s own KDoc on
    // why this must not call zrpErrorMessage()/zrpErrorLimit()
    // separately (each would re-read the same already-consumed stream).
    val body = try { http.zrpErrorBody() } catch (_: Exception) { null }
    return when (http.code()) {
        429 -> RepostFailureInfo(RepostFailure.RATE_LIMITED, limit = body?.limit)
        403 -> {
            // The two 403 bodies differ only by message; "private" is
            // the one stable token that distinguishes the private-
            // account refusal.
            if (body?.error?.contains("private", ignoreCase = true) == true) {
                RepostFailureInfo(RepostFailure.PRIVATE_ACCOUNT)
            } else {
                RepostFailureInfo(RepostFailure.FORBIDDEN)
            }
        }
        else -> RepostFailureInfo(RepostFailure.GENERIC)
    }
}

@Composable
fun repostFailureMessage(failure: RepostFailureInfo): String {
    val limit = failure.limit
    if (failure.kind == RepostFailure.RATE_LIMITED && limit != null) {
        return stringResource(R.string.post_repost_rate_limited_error, limit)
    }
    return stringResource(
        when (failure.kind) {
            RepostFailure.PRIVATE_ACCOUNT -> R.string.post_repost_private_error
            RepostFailure.FORBIDDEN -> R.string.post_repost_forbidden_error
            // RATE_LIMITED with no parsed limit (malformed/unexpected
            // body) falls back to the same generic message as any other
            // unclassifiable failure, rather than showing "reached (null)".
            RepostFailure.RATE_LIMITED, RepostFailure.GENERIC -> R.string.post_repost_failed
        },
    )
}
