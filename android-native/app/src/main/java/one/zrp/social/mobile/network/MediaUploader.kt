package one.zrp.social.mobile.network

import android.content.ContentResolver
import android.net.Uri
import com.google.gson.Gson
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink

data class UploadedMedia(val url: String, val type: String?, val isGif: Boolean)

private data class UploadServerData(val url: String? = null, val type: String? = null, val isGif: Boolean? = null)

private data class UploadedFileResponse(
    val error: String? = null,
    val ufsUrl: String? = null,
    val url: String? = null,
    val serverData: UploadServerData? = null,
)

/**
 * Uploads a single file straight to the presigned URL UploadThingApi
 * returned, using the exact wire format the real, installed
 * uploadthing v7.7.4 client uses under the hood (verified against
 * node_modules/uploadthing/client/index.js's own uploadWithProgress -
 * a PUT of multipart/form-data with one "file" field, not a raw
 * request body, which is the easy-to-miss detail here). UploadThing's
 * ingest server calls our backend's onUploadComplete handler
 * internally and returns its result inline as this same PUT's JSON
 * response (serverData) - no separate polling or webhook needed
 * client-side.
 *
 * Deliberately its own plain OkHttpClient rather than ApiClient's: the
 * presigned URL points at UploadThing's own storage host, not zrp.one,
 * and ZRP's session cookie (attached to every ApiClient request by its
 * sessionCookieInterceptor) must never be sent to a third-party host.
 */
object MediaUploader {
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.MINUTES)
        .readTimeout(2, TimeUnit.MINUTES)
        .build()

    suspend fun upload(
        contentResolver: ContentResolver,
        uri: Uri,
        contentLength: Long,
        mimeType: String,
        fileName: String,
        presigned: PresignedUpload,
        onProgress: (Float) -> Unit,
    ): UploadedMedia = withContext(Dispatchers.IO) {
        val body = StreamingRequestBody(contentResolver, uri, mimeType.toMediaTypeOrNull(), contentLength, onProgress)
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, body)
            .build()
        val request = Request.Builder()
            .url(presigned.url)
            .put(multipart)
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: throw IOException("Empty response from the upload server.")
            val parsed = runCatching { gson.fromJson(text, UploadedFileResponse::class.java) }
                .getOrNull()

            if (!response.isSuccessful || parsed == null || parsed.error != null) {
                throw IOException(parsed?.error ?: "Upload failed (HTTP ${response.code}).")
            }

            val url = parsed.serverData?.url ?: parsed.ufsUrl ?: parsed.url
                ?: throw IOException("The upload server returned no file URL.")

            UploadedMedia(
                url = url,
                type = parsed.serverData?.type,
                isGif = parsed.serverData?.isGif ?: false,
            )
        }
    }
}

/**
 * Streams the picked file's bytes straight from its content:// Uri
 * into the multipart body, rather than reading the whole file into
 * memory first - a post can attach a video up to a plan's real
 * videoUploadMB limit (up to 2GB on enterprise), and buffering that
 * fully would risk OutOfMemoryError on real devices.
 */
private class StreamingRequestBody(
    private val contentResolver: ContentResolver,
    private val uri: Uri,
    private val mediaType: MediaType?,
    private val length: Long,
    private val onProgress: (Float) -> Unit,
) : RequestBody() {
    override fun contentType(): MediaType? = mediaType

    override fun contentLength(): Long = length

    override fun writeTo(sink: BufferedSink) {
        val input = contentResolver.openInputStream(uri) ?: throw IOException("Couldn't open the selected file.")
        input.use { stream ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var uploaded = 0L
            while (true) {
                val read = stream.read(buffer)
                if (read == -1) break
                sink.write(buffer, 0, read)
                uploaded += read
                if (length > 0) onProgress(uploaded.toFloat() / length)
            }
        }
    }

    private companion object {
        const val DEFAULT_BUFFER_SIZE = 8192
    }
}
