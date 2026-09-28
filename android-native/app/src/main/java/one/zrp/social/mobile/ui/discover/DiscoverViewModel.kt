package one.zrp.social.mobile.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.DiscoverRepository
import one.zrp.social.mobile.network.DiscoverEventType
import one.zrp.social.mobile.network.DiscoverItem
import one.zrp.social.mobile.network.DiscoverPage

/** A one-shot, non-error UI event - matches page.tsx's own transient `toast` state. */
enum class DiscoverToast {
    NOT_INTERESTED_CONFIRMED,
    NOT_INTERESTED_FAILED,
    CREATOR_MUTED,
    CREATOR_BLOCKED,
    REPORT_SUBMITTED,
    REPORT_FAILED,
    ACTION_FAILED,
}

data class DiscoverUiState(
    val isLoading: Boolean = true,
    val items: List<DiscoverItem> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoadingMore: Boolean = false,
    val currentIndex: Int = 0,
    val muted: Boolean = true,
    val ownUserId: String? = null,
    val error: String? = null,
    val toast: DiscoverToast? = null,
)

/**
 * ZRP Discover - ported from src/app/discover/page.tsx: the real
 * server-ranked vertical video feed against GET /api/discover, plus its
 * own watch-event reporting (IMPRESSION/START/PROGRESS_25/50/75/
 * COMPLETE/SKIP - see DiscoverWatchEvents.kt) and "not interested"/mute/
 * block dismissal. Like/repost/save/follow/report reuse the same real
 * endpoints every other feed already uses.
 */
class DiscoverViewModel(private val repository: DiscoverRepository) : ViewModel() {
    private val _state = MutableStateFlow(DiscoverUiState())
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    // Per-post watch-event dedup for this viewing session - the native
    // equivalent of page.tsx's own `firedEvents` ref (see
    // DiscoverWatchEvents.kt's own KDoc for why this, not the server's
    // dedup window alone, decides whether a request is even sent). Not
    // part of UI state: it drives no rendering.
    private val firedEvents = mutableMapOf<String, MutableSet<DiscoverEventType>>()
    private fun firedFor(postId: String): MutableSet<DiscoverEventType> =
        firedEvents.getOrPut(postId) { mutableSetOf() }

    init {
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
        load()
        // IMPRESSION for whatever lands on page 0 once the first page loads.
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getFeed(cursor = null)
                .onSuccess { page ->
                    applyFreshPage(page)
                    page.items.firstOrNull()?.let { fireImpressionIfNeeded(it.id) }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load Discover right now.") }
                }
        }
    }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.isLoadingMore || s.endReached) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getFeed(cursor)
                .onSuccess { page -> applyAppendedPage(page) }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    private fun applyFreshPage(page: DiscoverPage) {
        _state.update {
            it.copy(
                isLoading = false,
                items = page.items,
                nextCursor = page.nextCursor,
                endReached = page.nextCursor == null,
            )
        }
    }

    private fun applyAppendedPage(page: DiscoverPage) {
        _state.update {
            it.copy(
                items = it.items + page.items,
                nextCursor = page.nextCursor,
                isLoadingMore = false,
                endReached = page.nextCursor == null,
            )
        }
    }

    /**
     * The active pager page changed: report SKIP for the outgoing post
     * if it started but never finished, and IMPRESSION for the new one -
     * matches page.tsx's own activePostId effect exactly. Also triggers
     * loadMore two pages before the end, same as ShortsViewModel's own
     * setCurrentIndex.
     */
    fun setCurrentIndex(index: Int) {
        val items = _state.value.items
        val previous = _state.value.currentIndex.takeIf { it != index }?.let { items.getOrNull(it) }
        _state.update { it.copy(currentIndex = index) }

        if (previous != null) {
            val fired = firedFor(previous.id)
            if (shouldFireSkip(fired)) {
                fired += DiscoverEventType.SKIP
                sendEvent(previous.id, DiscoverEventType.SKIP)
            }
        }
        items.getOrNull(index)?.let { fireImpressionIfNeeded(it.id) }

        if (index >= items.size - 2) loadMore()
    }

    private fun fireImpressionIfNeeded(postId: String) {
        val fired = firedFor(postId)
        if (shouldFireImpression(fired)) {
            fired += DiscoverEventType.IMPRESSION
            sendEvent(postId, DiscoverEventType.IMPRESSION)
        }
    }

    /** The active item's player actually started playing - matches handlePlaying. */
    fun onPlaybackStarted(postId: String) {
        val fired = firedFor(postId)
        if (shouldFireStart(fired)) {
            fired += DiscoverEventType.START
            sendEvent(postId, DiscoverEventType.START)
        }
    }

    /** A position update from the active item's player - matches handleTimeUpdate. */
    fun onPlaybackProgress(postId: String, positionMs: Long, durationMs: Long) {
        if (postId != _state.value.items.getOrNull(_state.value.currentIndex)?.id) return
        val fired = firedFor(postId)
        for (type in getProgressEventsToFire(positionMs, durationMs, fired)) {
            fired += type
            sendEvent(postId, type, positionMs.toInt())
        }
    }

    private fun sendEvent(postId: String, type: DiscoverEventType, watchedMs: Int? = null) {
        viewModelScope.launch { repository.recordEvent(postId, type, watchedMs) }
    }

    fun toggleMuted() = _state.update { it.copy(muted = !it.muted) }

    fun dismissToast() = _state.update { it.copy(toast = null) }

    /** A post whose video failed to play - matches DiscoverSlide's own local playback-error state, dropped from the feed rather than left stuck. */
    fun removeBrokenPost(postId: String) {
        _state.update { it.copy(items = it.items.filter { item -> item.id != postId }) }
    }

    fun toggleLike(postId: String) {
        if (_state.value.ownUserId == null) return
        val previousItems = _state.value.items
        _state.update { s -> s.copy(items = s.items.map { if (it.id == postId) applyOptimisticLike(it) else it }) }
        viewModelScope.launch {
            repository.toggleLike(postId).onFailure { _state.update { it.copy(items = previousItems) } }
        }
    }

    fun toggleRepost(postId: String) {
        if (_state.value.ownUserId == null) return
        val previousItems = _state.value.items
        _state.update { s -> s.copy(items = s.items.map { if (it.id == postId) applyOptimisticRepost(it) else it }) }
        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure { _state.update { it.copy(items = previousItems) } }
        }
    }

    fun toggleSave(postId: String) {
        if (_state.value.ownUserId == null) return
        val previousItems = _state.value.items
        _state.update { s ->
            s.copy(items = s.items.map { item ->
                if (item.id == postId) item.copy(viewerState = item.viewerState.copy(saved = !item.viewerState.saved)) else item
            })
        }
        viewModelScope.launch {
            repository.toggleSave(postId).onFailure { _state.update { it.copy(items = previousItems) } }
        }
    }

    // Scoped by authorId (not postId) - the same creator can legitimately
    // appear more than once in the feed, and following them should flip
    // every one of their items at once, matching handleToggleFollow's own
    // `it.author.id === authorId` update.
    fun toggleFollow(authorId: String, username: String) {
        if (_state.value.ownUserId == null) return
        val previousItems = _state.value.items
        _state.update { s ->
            s.copy(items = s.items.map { item ->
                if (item.author.id == authorId) {
                    item.copy(viewerState = item.viewerState.copy(followsAuthor = !item.viewerState.followsAuthor))
                } else {
                    item
                }
            })
        }
        viewModelScope.launch {
            repository.toggleFollow(username).onFailure { _state.update { it.copy(items = previousItems) } }
        }
    }

    // Removes the item immediately (matches handleNotInterested's own
    // optimistic removal) - a failure shows a toast but does not restore
    // it, since a dismissal the viewer already saw disappear reappearing
    // moments later would read as a bug, not a retry.
    fun markNotInterested(postId: String) {
        _state.update { it.copy(items = it.items.filter { item -> item.id != postId }) }
        viewModelScope.launch {
            repository.markNotInterested(postId)
                .onSuccess { _state.update { it.copy(toast = DiscoverToast.NOT_INTERESTED_CONFIRMED) } }
                .onFailure { _state.update { it.copy(toast = DiscoverToast.NOT_INTERESTED_FAILED) } }
        }
    }

    fun muteCreator(authorId: String) {
        _state.update { it.copy(items = it.items.filter { item -> item.author.id != authorId }) }
        viewModelScope.launch {
            repository.toggleMute(authorId)
                .onSuccess { _state.update { it.copy(toast = DiscoverToast.CREATOR_MUTED) } }
                .onFailure { _state.update { it.copy(toast = DiscoverToast.ACTION_FAILED) } }
        }
    }

    fun blockCreator(authorId: String, username: String) {
        _state.update { it.copy(items = it.items.filter { item -> item.author.id != authorId }) }
        viewModelScope.launch {
            repository.toggleBlock(username)
                .onSuccess { _state.update { it.copy(toast = DiscoverToast.CREATOR_BLOCKED) } }
                .onFailure { _state.update { it.copy(toast = DiscoverToast.ACTION_FAILED) } }
        }
    }

    fun reportPost(postId: String, reason: String, details: String?) {
        viewModelScope.launch {
            repository.reportPost(postId, reason, details)
                .onSuccess { _state.update { it.copy(toast = DiscoverToast.REPORT_SUBMITTED) } }
                .onFailure { _state.update { it.copy(toast = DiscoverToast.REPORT_FAILED) } }
        }
    }

    private fun applyOptimisticLike(item: DiscoverItem): DiscoverItem {
        val wasLiked = item.viewerState.liked
        return item.copy(
            viewerState = item.viewerState.copy(liked = !wasLiked),
            stats = item.stats.copy(likes = (item.stats.likes + if (wasLiked) -1 else 1).coerceAtLeast(0)),
        )
    }

    private fun applyOptimisticRepost(item: DiscoverItem): DiscoverItem {
        val wasReposted = item.viewerState.reposted
        return item.copy(
            viewerState = item.viewerState.copy(reposted = !wasReposted),
            stats = item.stats.copy(reposts = (item.stats.reposts + if (wasReposted) -1 else 1).coerceAtLeast(0)),
        )
    }
}

class DiscoverViewModelFactory(private val repository: DiscoverRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = DiscoverViewModel(repository) as T
}
