package one.zrp.social.mobile.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.zrpErrorMessage
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
 * repostable (e.g. still scheduled). Everything else - network, 5xx,
 * a rate limit - is a generic failure.
 *
 * ViewModels have no Context to resolve a string with (see
 * util/LocalizedError.kt), so they hold this enum and the Composable
 * render site maps it to the real string resource via
 * [repostFailureMessage].
 */
enum class RepostFailure { PRIVATE_ACCOUNT, FORBIDDEN, GENERIC }

fun Throwable.toRepostFailure(): RepostFailure {
    val http = this as? HttpException ?: return RepostFailure.GENERIC
    if (http.code() != 403) return RepostFailure.GENERIC
    // The two 403 bodies differ only by message; "private" is the one
    // stable token that distinguishes the private-account refusal.
    val message = try { http.zrpErrorMessage() } catch (_: Exception) { null }
    return if (message != null && message.contains("private", ignoreCase = true)) {
        RepostFailure.PRIVATE_ACCOUNT
    } else {
        RepostFailure.FORBIDDEN
    }
}

@Composable
fun repostFailureMessage(failure: RepostFailure): String = stringResource(
    when (failure) {
        RepostFailure.PRIVATE_ACCOUNT -> R.string.post_repost_private_error
        RepostFailure.FORBIDDEN -> R.string.post_repost_forbidden_error
        RepostFailure.GENERIC -> R.string.post_repost_failed
    },
)
