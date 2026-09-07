package one.zrp.social.mobile.ui.shorts

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.util.getPlanLimits

/**
 * Mirrors ShortUploadModal.tsx's own error surface. UploadFailed and
 * PublishFailed collapse several distinct web error codes
 * (UPLOAD_FAILED/errUploadFailedNoFile/errUploadFailedNoUrl/errGeneric
 * etc.) into one case each: MediaUploadRepository.upload already turns
 * every one of those distinct UploadThing-SDK failure points into a
 * single Result.failure with a real message (see MediaUploader's own
 * KDoc), so native has no way to tell those cases apart the way web's
 * separate uploadFiles()/fetch() calls can - a coarser, still-honest
 * error surface, not a missing one.
 */
sealed class ShortUploadError {
    object GifNotAllowed : ShortUploadError()
    object NotVideo : ShortUploadError()
    data class TooLarge(val maxMb: Int) : ShortUploadError()
    object ChooseVideoFirst : ShortUploadError()
    object GifSimple : ShortUploadError()
    object OnlyRealVideo : ShortUploadError()
    object UploadedGif : ShortUploadError()
    object PublishedGif : ShortUploadError()
    // MediaUploadRepository.upload throws this specific exception type
    // only when requestPresignedUrls itself came back empty - the same
    // real failure mode web's own URL_GENERATION_FAILED code names.
    object UrlGenFailed : ShortUploadError()
    data class UploadFailed(val detail: String) : ShortUploadError()
    data class PublishFailed(val detail: String?) : ShortUploadError()
}

data class ShortsUploadUiState(
    val fileUri: Uri? = null,
    val fileName: String = "",
    val mimeType: String = "",
    val fileSize: Long = 0L,
    val caption: String = "",
    val uploading: Boolean = false,
    val error: ShortUploadError? = null,
    val plan: String = "free",
    val posted: Post? = null,
)

/**
 * "Post a Short" - ported field-for-field from ShortUploadModal.tsx:
 * a hard GIF block, a hard real-video check (extension first, then
 * MIME type - matching isGifFile/isRealVideoFile exactly), the real
 * per-plan videoUploadMB cap, re-validated a second time at submit
 * exactly like the website does, then the same real two-step
 * UploadThing upload MediaUploadRepository already drives for the
 * Create tab's composer (slug "postMedia" - the same real
 * ourFileRouter route ShortUploadModal.tsx itself calls
 * uploadFiles("postMedia", ...) against), followed by the same real
 * POST /api/posts {content, imageUrl, mediaType: "video"} call. Also
 * re-checks the uploaded URL and the server's own created-post
 * response for a ".gif" extension before handing the post back,
 * matching the website's own defense-in-depth checks.
 */
class ShortsUploadViewModel(
    private val repository: PostsRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(ShortsUploadUiState())
    val state: StateFlow<ShortsUploadUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { ApiClient.authApi.getSession().user?.plan }
                .getOrNull()
                ?.let { plan -> _state.update { it.copy(plan = plan) } }
        }
    }

    fun onFilePicked(fileName: String, mimeType: String, size: Long, uri: Uri) {
        if (isGifFile(fileName, mimeType)) {
            _state.update { it.copy(error = ShortUploadError.GifNotAllowed) }
            return
        }
        if (!isRealVideoFile(fileName, mimeType)) {
            _state.update { it.copy(error = ShortUploadError.NotVideo) }
            return
        }
        val maxMb = getPlanLimits(_state.value.plan).videoUploadMB
        if (size > maxMb * 1024L * 1024L) {
            _state.update { it.copy(error = ShortUploadError.TooLarge(maxMb)) }
            return
        }
        _state.update {
            it.copy(fileUri = uri, fileName = fileName, mimeType = mimeType, fileSize = size, error = null)
        }
    }

    fun onClearFile() {
        _state.update { it.copy(fileUri = null, fileName = "", mimeType = "", fileSize = 0L, error = null) }
    }

    fun onCaptionChange(caption: String) {
        _state.update { it.copy(caption = caption) }
    }

    fun dismissError() {
        _state.update { it.copy(error = null) }
    }

    fun consumePosted() {
        _state.update { it.copy(posted = null) }
    }

    fun submit(contentResolver: ContentResolver) {
        val s = _state.value
        if (s.uploading) return
        val uri = s.fileUri
        if (uri == null) {
            _state.update { it.copy(error = ShortUploadError.ChooseVideoFirst) }
            return
        }
        // Re-validated a second time, matching handleSubmit's own
        // second GIF/real-video pass on the website.
        if (isGifFile(s.fileName, s.mimeType)) {
            _state.update { it.copy(error = ShortUploadError.GifSimple) }
            return
        }
        if (!isRealVideoFile(s.fileName, s.mimeType)) {
            _state.update { it.copy(error = ShortUploadError.OnlyRealVideo) }
            return
        }

        _state.update { it.copy(uploading = true, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "postMedia",
                contentResolver = contentResolver,
                uri = uri,
                fileName = s.fileName,
                mimeType = s.mimeType,
                size = s.fileSize,
                onProgress = {},
            ).onFailure { error ->
                val mapped = if (error is IllegalStateException) {
                    ShortUploadError.UrlGenFailed
                } else {
                    ShortUploadError.UploadFailed(error.message ?: "Unknown error")
                }
                _state.update { it.copy(uploading = false, error = mapped) }
            }.onSuccess { uploaded ->
                if (mediaPath(uploaded.url).endsWith(".gif")) {
                    _state.update { it.copy(uploading = false, error = ShortUploadError.UploadedGif) }
                    return@onSuccess
                }
                repository.createPost(s.caption.trim(), null, listOf(uploaded.url), "video", null)
                    .onSuccess { post ->
                        if (post.imageUrl == null || mediaPath(post.imageUrl).endsWith(".gif")) {
                            _state.update { it.copy(uploading = false, error = ShortUploadError.PublishedGif) }
                            return@onSuccess
                        }
                        _state.update { it.copy(uploading = false, posted = post) }
                    }
                    .onFailure { error ->
                        _state.update { it.copy(uploading = false, error = ShortUploadError.PublishFailed(error.message)) }
                    }
            }
        }
    }
}

private fun fileExtension(fileName: String): String {
    val base = fileName.lowercase().substringBefore('?').substringBefore('#')
    val dot = base.lastIndexOf('.')
    return if (dot == -1) "" else base.substring(dot)
}

private fun mediaPath(url: String): String = url.lowercase().substringBefore('?').substringBefore('#')

private val shortVideoExtensions = setOf(".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp")

private fun isGifFile(fileName: String, mimeType: String): Boolean =
    fileExtension(fileName) == ".gif" || mimeType.lowercase() == "image/gif"

// GIF always wins - ported from isRealVideoFile's own comment: never
// let a GIF into the Short upload flow, even one with a video MIME type.
private fun isRealVideoFile(fileName: String, mimeType: String): Boolean {
    if (isGifFile(fileName, mimeType)) return false
    if (fileExtension(fileName) in shortVideoExtensions) return true
    return mimeType.lowercase().startsWith("video/")
}

class ShortsUploadViewModelFactory(private val repository: PostsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ShortsUploadViewModel(repository) as T
}
