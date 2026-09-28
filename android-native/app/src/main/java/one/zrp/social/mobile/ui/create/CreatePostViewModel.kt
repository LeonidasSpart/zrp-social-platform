package one.zrp.social.mobile.ui.create

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.text.SimpleDateFormat
import java.util.Locale
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.GifResult
import one.zrp.social.mobile.network.PollCreateRequest
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.components.findMentionQuery
import one.zrp.social.mobile.util.PollLimits
import one.zrp.social.mobile.util.getPlanLimits

/**
 * "POST" | "RECRUITMENT" | "ARTICLE" - the same three values
 * Post.type takes server-side, as a real enum rather than the bare
 * string PostComposer.tsx's own `postType` state uses, since Kotlin
 * has no risk of a typo'd literal the way that string does.
 */
enum class PostCreationType { POST, RECRUITMENT, ARTICLE }

/**
 * Pure port of PostComposer.tsx's own `isSubmitDisabled` (the
 * RECRUITMENT/ARTICLE-relevant subset of it - the image-count/length-
 * overLimit checks it also has aren't reachable in this app's composer,
 * whose text field and media picker already enforce those caps at
 * input time). Extracted out of submit() itself so the gating logic is
 * directly unit-testable without a ViewModel/repository/coroutine.
 */
internal fun isCreatePostSubmitBlocked(
    content: String,
    hasMedia: Boolean,
    hasPoll: Boolean,
    isPollValid: Boolean,
    isScheduling: Boolean,
    hasScheduledAt: Boolean,
    postType: PostCreationType,
    company: String,
    articleBody: String,
    isPosting: Boolean,
    isUploading: Boolean,
): Boolean {
    return (content.isEmpty() && !hasMedia && !hasPoll && postType != PostCreationType.ARTICLE) ||
        (isScheduling && !hasScheduledAt) ||
        (hasPoll && !isPollValid) ||
        (postType == PostCreationType.RECRUITMENT && company.trim().isEmpty()) ||
        (postType == PostCreationType.ARTICLE && articleBody.trim().isEmpty()) ||
        isPosting ||
        isUploading
}

/**
 * Pure port of PostComposer.tsx's own submit-payload content fallback:
 * an ARTICLE's title never borrows the poll question (a poll can't even
 * be open for one - see CreatePostViewModel.onPostTypeChange) and stays
 * exactly what was typed (possibly empty); every other type falls back
 * to the poll question so the post never ends up with no content at all
 * just because the user only typed a question.
 */
internal fun resolveCreatePostContent(content: String, pollQuestion: String, postType: PostCreationType): String {
    return if (postType == PostCreationType.ARTICLE) content else content.ifEmpty { pollQuestion.trim() }
}

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
    // @mention autocomplete (PostComposer.tsx's own MentionAutocomplete)
    // - non-empty only while the cursor sits inside an in-progress
    // "@partial" token; cleared the moment it doesn't (finished mention,
    // cursor moved elsewhere, or the debounced search comes back empty).
    val mentionSuggestions: List<SearchUser> = emptyList(),
    // Mirrors PostComposer.tsx's own postType/company/location/applyUrl/
    // articleBody state exactly. `content` above doubles as the
    // RECRUITMENT/ARTICLE post's own text/title in both cases - there's
    // no separate field for it, same as web. These four are left as-is
    // across a type switch (handlePostTypeChange never clears them),
    // and are NOT persisted to the draft store (see the class KDoc's
    // own note on why - native drafts stay content/media/type-agnostic
    // for now).
    val postType: PostCreationType = PostCreationType.POST,
    val company: String = "",
    val location: String = "",
    val applyUrl: String = "",
    val articleBody: String = "",
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
    private val searchRepository: SearchRepository = SearchRepository(),
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

    private var mentionSearchJob: Job? = null

    // [cursor] is the current selection end within [content] - see
    // findMentionQuery's own KDoc for why this, not just the text
    // itself, is what decides whether a mention search is even running.
    fun onContentChange(content: String, cursor: Int) {
        _state.update { it.copy(content = content, error = null) }

        val query = findMentionQuery(content, cursor)
        mentionSearchJob?.cancel()
        if (query == null) {
            _state.update { it.copy(mentionSuggestions = emptyList()) }
            return
        }
        // Matches MentionAutocomplete.tsx's own 200ms debounce - avoids
        // firing a real GET /search on every keystroke of a fast typist.
        mentionSearchJob = viewModelScope.launch {
            delay(200)
            searchRepository.searchUsers(query)
                .onSuccess { users -> _state.update { it.copy(mentionSuggestions = users) } }
                .onFailure { _state.update { it.copy(mentionSuggestions = emptyList()) } }
        }
    }

    fun dismissMentionSuggestions() {
        mentionSearchJob?.cancel()
        _state.update { it.copy(mentionSuggestions = emptyList()) }
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

    // Matches PostComposer.tsx's own handlePostTypeChange: a plan
    // without the feature can't switch into it at all (the type-
    // selector button is hidden entirely on web for the same reason -
    // this is defense in depth, not the only gate). Switching away from
    // POST closes the poll builder (a poll only ever applies to a plain
    // post) without clearing the underlying question/options/expiry -
    // switching back to POST later still has them, same as web leaving
    // that state untouched.
    fun onPostTypeChange(type: PostCreationType) {
        val limits = getPlanLimits(_state.value.plan)
        if (type == PostCreationType.RECRUITMENT && !limits.recruitmentProfiles) return
        if (type == PostCreationType.ARTICLE && !limits.articlePublishing) return
        _state.update {
            it.copy(
                postType = type,
                showPollBuilder = if (type == PostCreationType.POST) it.showPollBuilder else false,
                error = null,
            )
        }
    }

    fun onCompanyChange(value: String) {
        _state.update { it.copy(company = value, error = null) }
    }

    fun onLocationChange(value: String) {
        _state.update { it.copy(location = value, error = null) }
    }

    fun onApplyUrlChange(value: String) {
        _state.update { it.copy(applyUrl = value, error = null) }
    }

    fun onArticleBodyChange(value: String) {
        _state.update { it.copy(articleBody = value, error = null) }
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
        val postType = current.postType
        if (
            isCreatePostSubmitBlocked(
                content = content,
                hasMedia = mediaUrls.isNotEmpty(),
                hasPoll = hasPoll,
                isPollValid = current.isPollValid,
                isScheduling = isScheduling,
                hasScheduledAt = scheduledAtMillis != null,
                postType = postType,
                company = current.company,
                articleBody = current.articleBody,
                isPosting = current.isPosting,
                isUploading = current.isUploading,
            )
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
        val effectiveContent = resolveCreatePostContent(content, current.pollQuestion, postType)
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
            repository.createPost(
                content = effectiveContent,
                quotePostId = quotePostId,
                mediaUrls = mediaUrls,
                mediaType = mediaType,
                scheduledAt = scheduledAt,
                poll = poll,
                scheduledAtOffsetMinutes = scheduledAtOffsetMinutes,
                type = postType.name,
                company = if (postType == PostCreationType.RECRUITMENT) current.company.trim() else null,
                location = if (postType == PostCreationType.RECRUITMENT) current.location.trim() else null,
                applyUrl = if (postType == PostCreationType.RECRUITMENT) current.applyUrl.trim() else null,
                articleBody = if (postType == PostCreationType.ARTICLE) current.articleBody else null,
            )
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
