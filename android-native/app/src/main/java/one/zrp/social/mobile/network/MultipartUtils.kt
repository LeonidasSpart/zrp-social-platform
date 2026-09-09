package one.zrp.social.mobile.network

import android.content.ContentResolver
import android.net.Uri
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Builds a "file" multipart part straight from a picked content:// Uri,
 * for the small (server-capped at 5MB) image endpoints that take a
 * plain multipart POST rather than going through UploadThing's
 * presigned-URL protocol (see SettingsApi's avatar/cover KDoc). Reading
 * the whole file into memory is safe at that size - unlike
 * MediaUploader's streaming approach, which exists specifically because
 * postMedia allows videos up to a plan's real videoUploadMB (up to 2GB).
 */
fun buildFileMultipart(contentResolver: ContentResolver, uri: Uri): MultipartBody.Part =
    buildNamedFileMultipart(contentResolver, uri, "file")

/**
 * The same part, under a caller-chosen form field name. Most image
 * routes read "file", but the news-network feed route reads either
 * "avatarFile" or "coverFile" from the form and decides which column to
 * write from which one was sent (see its own handleImageUpload), so the
 * field name is part of the request there rather than a constant.
 */
fun buildNamedFileMultipart(
    contentResolver: ContentResolver,
    uri: Uri,
    fieldName: String,
): MultipartBody.Part {
    val mimeType = contentResolver.getType(uri) ?: "image/jpeg"
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
        ?: throw IOException("Couldn't read the selected file.")
    val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(fieldName, "upload", requestBody)
}
