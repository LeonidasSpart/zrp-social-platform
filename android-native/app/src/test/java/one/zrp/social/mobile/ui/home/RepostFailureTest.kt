package one.zrp.social.mobile.ui.home

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import one.zrp.social.mobile.ui.components.RepostFailure
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
 */
class RepostFailureTest {

    private fun http(code: Int, body: String): HttpException =
        HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun privateAccount403IsClassifiedAsPrivate() {
        val error = http(403, """{"error":"Posts from private accounts can't be reposted"}""")
        assertEquals(RepostFailure.PRIVATE_ACCOUNT, error.toRepostFailure())
    }

    @Test
    fun other403IsClassifiedAsForbidden() {
        val error = http(403, """{"error":"Unable to repost this post"}""")
        assertEquals(RepostFailure.FORBIDDEN, error.toRepostFailure())
    }

    @Test
    fun malformed403BodyStillReadsAsForbidden() {
        assertEquals(RepostFailure.FORBIDDEN, http(403, "not json").toRepostFailure())
    }

    @Test
    fun nonForbiddenStatusIsGeneric() {
        assertEquals(RepostFailure.GENERIC, http(500, """{"error":"boom"}""").toRepostFailure())
        assertEquals(RepostFailure.GENERIC, http(429, """{"error":"Too many requests"}""").toRepostFailure())
    }

    @Test
    fun networkFailureIsGeneric() {
        assertEquals(RepostFailure.GENERIC, IOException("offline").toRepostFailure())
    }
}
