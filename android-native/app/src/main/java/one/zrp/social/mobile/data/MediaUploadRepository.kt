package one.zrp.social.mobile.data

import android.content.ContentResolver
import android.net.Uri
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.MediaUploader
import one.zrp.social.mobile.network.UploadFileMeta
import one.zrp.social.mobile.network.UploadThingUploadRequest
import one.zrp.social.mobile.network.UploadedMedia

/**
 * Drives the real two-step UploadThing protocol (see UploadThingApi's
 * and MediaUploader's own KDocs) for whichever real ourFileRouter slug
 * a caller needs - "postMedia" for the Create tab's composer today,
 * with avatar/banner/chatImage/etc. sharing this exact same repository
 * once those screens wire it in, since the protocol is identical for
 * every route in src/lib/uploadthing.ts.
 */
class MediaUploadRepository {
    suspend fun upload(
        slug: String,
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
        onProgress: (Float) -> Unit,
    ): Result<UploadedMedia> = runCatching {
        val presigneds = ApiClient.uploadThingApi.requestPresignedUrls(
            slug = slug,
            request = UploadThingUploadRequest(
                files = listOf(
                    UploadFileMeta(
                        name = fileName,
                        size = size,
                        type = mimeType,
                        lastModified = System.currentTimeMillis(),
                    ),
                ),
            ),
        )
        val presigned = presigneds.firstOrNull()
            ?: throw IllegalStateException("The server didn't return an upload URL.")

        MediaUploader.upload(
            contentResolver = contentResolver,
            uri = uri,
            contentLength = size,
            mimeType = mimeType,
            fileName = fileName,
            presigned = presigned,
            onProgress = onProgress,
        )
    }
}
