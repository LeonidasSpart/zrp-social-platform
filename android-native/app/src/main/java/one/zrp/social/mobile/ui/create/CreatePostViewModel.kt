package one.zrp.social.mobile.ui.create

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.text.SimpleDateFormat
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ComposerDraftStore
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.GifResult
import one.zrp.social.mobile.network.PollCreateRequest
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.util.PollLimits
import one.zrp.social.mobile.util.getPlanLimits

/**
 * A validation problem the composer needs to show translated - kept
 * separate from [CreatePostUiState.error] (server/network failures,
 * already-resolved messages) because a plain ViewModel can't resolve
 * Android string resources itself; CreatePostScreen maps each case to
 * its real, translated composer.err* string with the right arguments.
 */
sealed class MediaValidationError {
    data class AlreadyUploaded(val maxImages: Int) : MediaValidationError()
    data class FileTooLarge(val maxMb: Int) : MediaValidationError()
    object OnlyMedia : MediaValidationError()
    data class UploadFailed(val detail: String) : MediaValidationError()
    data class GifLimit(val maxImages: Int) : MediaValidationError()
}

data class CreatePostUiState(
    val content: String = "",
    val isPosting: Boolean = false,
    val error: String? = null,
    val posted: Boolean = false,
    val quotedPost: Post? = null,
    val isLoadingQuotedPost: Boolean = false,
    // Mirrors PostComposer.tsx's own imageUrls/mediaType exactly - a
    // selected GIF is just one more entry here (mediaType "image"),
    // not a separate concept, matching how handleGifSelect and
    // handleFileUpload both write into the same real state on web.
    val mediaUrls: List<String> = emptyList(),
    val mediaType: String? = null,
    val isUploading: Boolean = false,
    val uploadProgress: Float = 0f,
    val mediaError: MediaValidationError? = null,
    val plan: String = "free",
    val isScheduling: Boolean = false,
    val scheduledAtMillis: Long? = null,
    // Mirrors PostComposer.tsx's own showPollBuilder/pollQuestion/
    // pollOptions/pollExpiry state exactly - a poll and text/media can
    // technically coexist on web (the media/GIF buttons are never
    // disabled by showPollBuilder there), so this isn't mutually
    // exclusive with mediaUrls either.
    val showPollBuilder: Boolean = false,
    val pollQuestion: String = "",
    val pollOptions: List<String> = listOf("", ""),
    val pollExpiryMillis: Long? = null,
) {
    val validPollOptions: List<String> get() = pollOptions.map { it.trim() }.filter { it.isNotEmpty() }
    val isPollValid: Boolean get() = pollQuestion.trim().isNotEmpty() && validPollOptions.size >= 2
}

/**
 * Backs the Create tab's composer - a real POST /api/posts call. No
 * client-side reimplementation of the server's plan-based length
 * limit: a rejected post simply surfaces the server's own error
 * message. Image/video size and count limits ARE checked client-side
 * (mirroring PostComposer.tsx's own handleFileUpload) because those
 * gate which file gets uploaded to UploadThing at all, not the post
 * creation call itself - the same real plan numbers from
 * src/lib/limits.ts (see util/PlanLimits.kt), fetched once via the
 * real session the same way the website reads session.user.plan.
 *
 * When [quotePostId] is set (reached via the repost menu's "Quote"
 * option, matching the website's QuotePostModal), the real post being
 * quoted is fetched via GET /posts/{id} to render its own preview
 * above the composer, and submit() attaches quotePostId to the create
 * call the same way QuotePostModal.tsx does. QuotePostModal.tsx has no
 * draft-protection of its own (confirmed by reading the component), so
 * [draftStore] is only consulted for a plain new post below - matching
 * PostComposer.tsx's own DRAFT_KEY block exactly, right down to saving
 * a stripped-down draft (content/mediaUrls/mediaType only - native has
 * no postType concept to persist) after every change and clearing it
 * once a post actually goes through.
 */
class CreatePostViewModel(
    private val repository: PostsRepository,
    private val quotePostId: String? = null,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
    private val draftStore: ComposerDraftStore = ApiClient.getComposerDraftStore(),
) : ViewModel() {
    private val _state = MutableStateFlow(CreatePostUiState())
    val state: StateFlow<CreatePostUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { ApiClient.authApi.getSession().user?.plan }
                .getOrNull()
                ?.let { plan -> _state.update { it.copy(plan = plan) } }
        }

        if (quotePostId == null) {
            draftStore.load()?.let { draft ->
                _state.update {
                    it.copy(
                        content = draft.content,
                        mediaUrls = draft.mediaUrls,
                        mediaType = draft.mediaType,
                    )
                }
            }
            viewModelScope.launch {
                _state.map { Triple(it.content, it.mediaUrls, it.mediaType) }
                    .distinctUntilChanged()
                    .collect { (content, mediaUrls, mediaType) ->
                        draftStore.save(content, mediaUrls, mediaType)
                    }
            }
        }

        if (quotePostId != null) {
            _state.update { it.copy(isLoadingQuotedPost = true) }
            viewModelScope.launch {
                repository.getPost(quotePostId)
                    .onSuccess { post -> _state.update { it.copy(quotedPost = post, isLoadingQuotedPost = false) } }
                    .onFailure { error ->
                        _state.update {
                            it.copy(
                                isLoadingQuotedPost = false,
                                error = error.message ?: "Couldn't load the post you're quoting.",
                            )
                        }
                    }
            }
        }
    }

    fun onContentChange(content: String) {
        _state.update { it.copy(content = content, error = null) }
    }

    // Matches handleGifSelect exactly: a GIF is rejected the same way
    // as any other media once a plan allows zero images, or once
    // something is already attached - it never stacks with an existing
    // photo/video, and vice versa (onMediaPicked below applies the same
    // "already have media" rule to a real photo/video pick).
    fun onGifSelected(gif: GifResult) {
        val maxImages = getPlanLimits(_state.value.plan).imagesPerPost.coerceAtMost(4)
        if (maxImages <= 0 || _state.value.mediaUrls.isNotEmpty()) {
            _state.update { it.copy(mediaError = MediaValidationError.GifLimit(maxImages)) }
            return
        }
        _state.update {
            it.copy(mediaUrls = listOf(gif.url), mediaType = "image", mediaError = null, error = null)
        }
    }

    // Matches PostComposer.tsx's own per-tile remove buttons
    // (`prev.filter(u => u !== url)` for images, clearing both fields
    // outright for a video) - removing the only/last item always
    // clears mediaType too, so a fresh pick isn't stuck thinking a
    // video is still attached.
    fun onRemoveMediaAt(index: Int) {
        _state.update {
            val updated = it.mediaUrls.toMutableList().apply { if (index in indices) removeAt(index) }
            it.copy(mediaUrls = updated, mediaType = if (updated.isEmpty()) null else it.mediaType, mediaError = null)
        }
    }

    fun dismissMediaError() {
        _state.update { it.copy(mediaError = null) }
    }

    /**
     * A real photo or video picked from the device's own photo picker.
     * Validation order mirrors handleFileUpload's own: media-disabled
     * plan, video-can't-mix-with-anything, per-plan/router size caps,
     * then the actual upload.
     */
    fun onMediaPicked(
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
    ) {
        val limits = getPlanLimits(_state.value.plan)
        val maxImages = limits.imagesPerPost.coerceAtMost(4)
        val currentUrls = _state.value.mediaUrls
        val isVideo = mimeType.startsWith("video/")
        val isImage = mimeType.startsWith("image/")

        if (!isVideo && !isImage) {
            _state.update { it.copy(mediaError = MediaValidationError.OnlyMedia) }
            return
        }

        if (maxImages <= 0) {
            _state.update { it.copy(mediaError = MediaValidationError.AlreadyUploaded(maxImages)) }
            return
        }

        if (isVideo) {
            // Video is always exactly one media item - never mixed
            // with an image or GIF already attached.
            if (currentUrls.isNotEmpty()) {
                _state.update { it.copy(mediaError = MediaValidationError.OnlyMedia) }
                return
            }
            if (limits.videoUploadMB <= 0) {
                _state.update { it.copy(mediaError = MediaValidationError.FileTooLarge(0)) }
                return
            }
        } else if (currentUrls.size >= maxImages) {
            _state.update { it.copy(mediaError = MediaValidationError.AlreadyUploaded(maxImages)) }
            return
        }

        // Router-level flat caps from src/lib/uploadthing.ts (4MB image
        // is the same for every plan there; video uses the real
        // per-plan videoUploadMB, matching handleFileUpload's own
        // maxSize computation) - checked before spending an upload
        // attempt the server would reject anyway.
        val maxBytes = if (isVideo) limits.videoUploadMB * 1024L * 1024L else 4L * 1024 * 1024
        if (size > maxBytes) {
            val maxMb = if (isVideo) limits.videoUploadMB else 4
            _state.update { it.copy(mediaError = MediaValidationError.FileTooLarge(maxMb)) }
            return
        }

        _state.update { it.copy(isUploading = true, uploadProgress = 0f, mediaError = null, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "postMedia",
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = { progress -> _state.update { it.copy(uploadProgress = progress) } },
            ).onSuccess { uploaded ->
                _state.update {
                    if (uploaded.type == "video") {
                        it.copy(isUploading = false, mediaUrls = listOf(uploaded.url), mediaType = "video")
                    } else {
                        val merged = (it.mediaUrls + uploaded.url).take(maxImages)
                        it.copy(isUploading = false, mediaUrls = merged, mediaType = "image")
                    }
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isUploading = false,
                        mediaError = MediaValidationError.UploadFailed(error.message ?: "Unknown error"),
                    )
                }
            }
        }
    }

    // Matches PostComposer.tsx's own handleScheduleToggle: toggling off
    // also clears whatever date/time was picked, rather than leaving a
    // stale value the user would need to notice and re-clear.
    fun onToggleSchedule() {
        _state.update {
            val next = !it.isScheduling
            it.copy(isScheduling = next, scheduledAtMillis = if (next) it.scheduledAtMillis else null)
        }
    }

    fun onScheduledAtSelected(millis: Long) {
        _state.update { it.copy(scheduledAtMillis = millis, error = null) }
    }

    // Matches PostComposer.tsx's own handleTogglePoll: closing the
    // builder discards whatever question/options/expiry were entered
    // rather than keeping them around for a later re-open.
    fun onTogglePollBuilder() {
        _state.update {
            val next = !it.showPollBuilder
            it.copy(
                showPollBuilder = next,
                pollQuestion = if (next) it.pollQuestion else "",
                pollOptions = if (next) it.pollOptions else listOf("", ""),
                pollExpiryMillis = if (next) it.pollExpiryMillis else null,
                error = null,
            )
        }
    }

    fun onPollQuestionChange(text: String) {
        _state.update { it.copy(pollQuestion = text.take(PollLimits.questionMaxLength), error = null) }
    }

    fun onPollOptionChange(index: Int, text: String) {
        _state.update {
            val updated = it.pollOptions.toMutableList()
            if (index in updated.indices) updated[index] = text.take(PollLimits.optionMaxLength)
            it.copy(pollOptions = updated)
        }
    }

    // Matches PostComposer.tsx's own addPollOption cap.
    fun onAddPollOption() {
        _state.update {
            if (it.pollOptions.size >= PollLimits.maxOptions) it else it.copy(pollOptions = it.pollOptions + "")
        }
    }

    // Matches PostComposer.tsx's own removePollOption - the "Remove"
    // button only ever shows once there are more than 2 options, so a
    // poll can never drop below the real minimum.
    fun onRemovePollOption(index: Int) {
        _state.update {
            if (it.pollOptions.size <= 2 || index !in it.pollOptions.indices) {
                it
            } else {
                it.copy(pollOptions = it.pollOptions.toMutableList().apply { removeAt(index) })
            }
        }
    }

    fun onPollExpirySelected(millis: Long?) {
        _state.update { it.copy(pollExpiryMillis = millis, error = null) }
    }

    private val scheduledAtFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)

    fun submit() {
        val current = _state.value
        val content = current.content.trim()
        val mediaUrls = current.mediaUrls
        val mediaType = current.mediaType
        val isScheduling = current.isScheduling
        val scheduledAtMillis = current.scheduledAtMillis
        val hasPoll = current.showPollBuilder
        // Matches PostComposer.tsx's own isSubmitDisabled: a post needs
        // real text OR real media - not necessarily both - toggling
        // "Schedule" on without yet picking a date/time blocks submit
        // (web's own `schedulePost && !scheduledAt` check), and a poll
        // builder left open with fewer than 2 real options blocks it
        // too (web's own `hasPoll && !isPollValid` check).
        if (
            (content.isEmpty() && mediaUrls.isEmpty() && !hasPoll) ||
            (isScheduling && scheduledAtMillis == null) ||
            (hasPoll && !current.isPollValid) ||
            current.isPosting ||
            current.isUploading
        ) {
            return
        }
        val scheduledAt = scheduledAtMillis?.let { scheduledAtFormat.format(it) }
        // Closes the same real timezone bug web's own scheduled-time.ts
        // fix (F2) documents: scheduledAt alone is a naive wall-clock
        // string the server used to parse in ITS OWN timezone. Negating
        // java.util.TimeZone's offset (millis to ADD to UTC for local
        // time) converts it to JS's Date.getTimezoneOffset() convention
        // (UTC minus local) the server's resolveScheduledAt() expects -
        // see CreatePostRequest's own KDoc for the exact contract.
        val scheduledAtOffsetMinutes = scheduledAtMillis?.let {
            -(java.util.TimeZone.getDefault().getOffset(it) / 60_000)
        }
        // Matches PostComposer.tsx's own content fallback: an empty
        // text field falls back to the poll question itself when a
        // poll is being posted, so the post never ends up with no
        // content at all just because the user only typed a question.
        val effectiveContent = content.ifEmpty { current.pollQuestion.trim() }
        val poll = if (hasPoll) {
            PollCreateRequest(
                question = current.pollQuestion.trim(),
                options = current.validPollOptions,
                expiresAt = current.pollExpiryMillis?.let { scheduledAtFormat.format(it) },
            )
        } else {
            null
        }

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createPost(effectiveContent, quotePostId, mediaUrls, mediaType, scheduledAt, poll, scheduledAtOffsetMinutes)
                .onSuccess {
                    if (quotePostId == null) draftStore.clear()
                    _state.update { it.copy(isPosting = false, posted = true) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isPosting = false, error = error.message ?: "Couldn't create this post. Please try again.")
                    }
                }
        }
    }

    fun consumePostedEvent() {
        _state.update { it.copy(posted = false) }
    }
}
