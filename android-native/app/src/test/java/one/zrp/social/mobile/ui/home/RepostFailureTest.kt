package one.zrp.social.mobile.ui.home

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import one.zrp.social.mobile.ui.components.RepostFailure
import one.zrp.social.mobile.ui.components.RepostFailureInfo
import one.zrp.social.mobile.ui.components.toRepostFailure
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Classification of a refused POST /posts/{id}/repost into the message
 * the feed shows (see RepostFeedback.kt). Plain JVM: builds the same
 * Retrofit HttpException the real call site receives.
 *
 * The 429 cases are regression coverage for the daily-quota bug: this
 * status used to fall through to RepostFailure.GENERIC (a bare "couldn't
 * repost" toast, indistinguishable from a random network failure) even
 * though src/app/api/posts/[id]/repost/route.ts's 429 body carries a
 * real, plan-specific `limit` the client can build a fully localized
 * message from (see RepostFeedback.kt's own KDoc on why the server's raw
 * English sentence is never shown directly).
 */
class RepostFailureTest {

    private fun http(code: Int, body: String): HttpException =
        HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun privateAccount403IsClassifiedAsPrivate() {
        val error = http(403, """{"error":"Posts from private accounts can't be reposted"}""")
        assertEquals(RepostFailureInfo(RepostFailure.PRIVATE_ACCOUNT), error.toRepostFailure())
    }

    @Test
    fun other403IsClassifiedAsForbidden() {
        val error = http(403, """{"error":"Unable to repost this post"}""")
        assertEquals(RepostFailureInfo(RepostFailure.FORBIDDEN), error.toRepostFailure())
    }

    @Test
    fun malformed403BodyStillReadsAsForbidden() {
        assertEquals(RepostFailureInfo(RepostFailure.FORBIDDEN), http(403, "not json").toRepostFailure())
    }

    @Test
    fun dailyQuota429IsClassifiedAsRateLimitedWithItsRealLimit() {
        val error = http(
            429,
            """{"error":"Daily repost limit reached (50). Try again tomorrow or upgrade for a higher limit.","limit":50,"used":50,"remaining":0}""",
        )
        assertEquals(RepostFailureInfo(RepostFailure.RATE_LIMITED, limit = 50), error.toRepostFailure())
    }

    @Test
    fun malformed429BodyIsStillRateLimitedButWithNoLimit() {
        // repostFailureMessage() falls back to the generic string when
        // limit is null rather than ever showing a literal "null".
        assertEquals(RepostFailureInfo(RepostFailure.RATE_LIMITED, limit = null), http(429, "not json").toRepostFailure())
    }

    @Test
    fun nonForbiddenNonRateLimitedStatusIsGeneric() {
        assertEquals(RepostFailureInfo(RepostFailure.GENERIC), http(500, """{"error":"boom"}""").toRepostFailure())
        assertEquals(RepostFailureInfo(RepostFailure.GENERIC), http(404, """{"error":"Post not found"}""").toRepostFailure())
    }

    @Test
    fun networkFailureIsGeneric() {
        assertEquals(RepostFailureInfo(RepostFailure.GENERIC), IOException("offline").toRepostFailure())
    }
}
