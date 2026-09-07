package one.zrp.social.mobile.ui.stories

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.StoriesRepository

/**
 * A media validation problem the composer needs to show translated -
 * kept separate from [CreateStoryUiState.error] (server/network
 * failures, already-resolved messages) the same way
 * CreatePostViewModel's own MediaValidationError is: a plain ViewModel
 * can't resolve Android string resources itself, so CreateStoryScreen
 * maps each case to its real, translated stories.err* string.
 */
sealed class StoryMediaError {
    object UnsupportedType : StoryMediaError()
    data class FileTooLarge(val maxMb: Int) : StoryMediaError()
    data class UploadFailed(val detail: String) : StoryMediaError()
}

data class CreateStoryUiState(
    val content: String = "",
    val mediaUrl: String? = null,
    val mediaType: String? = null,
    val isUploading: Boolean = false,
    val uploadProgress: Float = 0f,
    val mediaError: StoryMediaError? = null,
    val isPosting: Boolean = false,
    val error: String? = null,
    val posted: Boolean = false,
)

/**
 * Backs the story composer - a real POST /stories call with the same
 * text-and/or-one-image-or-video shape StoryComposer.tsx's own
 * handleSubmit sends, media uploaded first via the real storyMedia
 * UploadThing router (see MediaUploadRepository/UploadThingApi).
 */
class CreateStoryViewModel(
    private val repository: StoriesRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(CreateStoryUiState())
    val state: StateFlow<CreateStoryUiState> = _state.asStateFlow()

    fun onContentChange(content: String) {
        _state.update { it.copy(content = content, error = null) }
    }

    fun onRemoveMedia() {
        _state.update { it.copy(mediaUrl = null, mediaType = null, mediaError = null) }
    }

    fun dismissMediaError() {
        _state.update { it.copy(mediaError = null) }
    }

    /**
     * Mirrors StoryComposer.tsx's own handleFileSelect: one image or
     * video, up to the storyMedia router's real flat caps (4MB image,
     * 16MB video - no per-plan gating, unlike post media), always
     * replacing whatever was picked before rather than stacking.
     */
    fun onMediaPicked(
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
    ) {
        val isImage = mimeType.startsWith("image/")
        val isVideo = mimeType.startsWith("video/")
        if (!isImage && !isVideo) {
            _state.update { it.copy(mediaError = StoryMediaError.UnsupportedType) }
            return
        }

        val maxBytes = if (isVideo) 16L * 1024 * 1024 else 4L * 1024 * 1024
        if (size > maxBytes) {
            _state.update { it.copy(mediaError = StoryMediaError.FileTooLarge(if (isVideo) 16 else 4)) }
            return
        }

        _state.update { it.copy(isUploading = true, uploadProgress = 0f, mediaError = null, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "storyMedia",
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = { progress -> _state.update { it.copy(uploadProgress = progress) } },
            ).onSuccess { uploaded ->
                _state.update {
                    it.copy(isUploading = false, mediaUrl = uploaded.url, mediaType = if (isVideo) "video" else "image")
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(isUploading = false, mediaError = StoryMediaError.UploadFailed(error.message ?: "Unknown error"))
                }
            }
        }
    }

    fun submit() {
        val content = _state.value.content.trim()
        val mediaUrl = _state.value.mediaUrl
        if ((content.isEmpty() && mediaUrl == null) || _state.value.isPosting || _state.value.isUploading) return

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createStory(content.ifEmpty { null }, mediaUrl, _state.value.mediaType)
                .onSuccess { _state.update { CreateStoryUiState(posted = true) } }
                .onFailure { error ->
                    _state.update {
                        it.copy(isPosting = false, error = error.message ?: "Couldn't post this story. Please try again.")
                    }
                }
        }
    }

    fun consumePostedEvent() {
        _state.update { it.copy(posted = false) }
    }
}
