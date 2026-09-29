package one.zrp.social.mobile.ui.marketplace

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Regression coverage for the "listing not found vs. genuine load
 * failure" fix (Task #4 parity audit): a real 404 and a transient
 * network/server error used to collapse into the exact same notFound=true
 * dead end, with no way to retry the latter. Plain JVM - builds the same
 * Retrofit HttpException the real call site receives, same pattern
 * RepostFailureTest.kt already established.
 */
class ListingDetailViewModelTest {

    private fun http(code: Int, body: String = "{}"): HttpException =
        HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `a real 404 is classified as not found`() {
        assertTrue(isListingNotFound(http(404)))
    }

    @Test
    fun `a 500 is not classified as not found`() {
        assertFalse(isListingNotFound(http(500)))
    }

    @Test
    fun `a 403 is not classified as not found`() {
        assertFalse(isListingNotFound(http(403)))
    }

    @Test
    fun `a plain network failure is not classified as not found`() {
        assertFalse(isListingNotFound(IOException("offline")))
    }

    @Test
    fun `a non-404 failure's message uses the server's own error text when present`() {
        val error = http(500, """{"error":"Something broke server-side"}""")
        assertEquals("Something broke server-side", listingLoadErrorMessage(error))
    }

    @Test
    fun `a non-404 failure with an unparsable body falls back to the generic network message`() {
        val error = http(500, "not json")
        assertEquals(one.zrp.social.mobile.data.ZrpErrors.NETWORK, listingLoadErrorMessage(error))
    }

    @Test
    fun `a plain network failure falls back to the generic network message`() {
        assertEquals(one.zrp.social.mobile.data.ZrpErrors.NETWORK, listingLoadErrorMessage(IOException("offline")))
    }
}
