package one.zrp.social.mobile.util

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns

/**
 * Resolves a picked content:// Uri's real display name and byte size -
 * shared by every attachment picker in the app (ConversationScreen's
 * image/video/document pickers, GroupConversationScreen's own image
 * picker, GroupParticipantsScreen's avatar picker) rather than each
 * screen re-querying the same two OpenableColumns itself. Falls back to
 * a generic name/0 size only if the provider genuinely doesn't answer -
 * MediaUploader's own upload still works with a 0 size guess, it just
 * loses byte-accurate progress reporting for that one edge case.
 */
fun queryFileNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "upload"
    var size = 0L
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}
