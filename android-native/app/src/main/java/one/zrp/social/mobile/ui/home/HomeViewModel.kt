package one.zrp.social.mobile.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdsRepository
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.ServedAd
import one.zrp.social.mobile.util.applyOptimisticVote
import one.zrp.social.mobile.util.hasAlreadyVotedOnPost

enum class FeedTab { FOR_YOU, FOLLOWING }

data class HomeUiState(
    val posts: List<Post> = emptyList(),
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
)

/**
 * Drives the Home screen's two real feed tabs (For You / Following).
 * Each tab keeps its own posts/cursor in its own StateFlow so
 * switching tabs and back doesn't re-fetch from scratch, matching how
 * the website's own tabs behave.
 */
class HomeViewModel(
    private val repository: PostsRepository,
    private val adsRepository: AdsRepository = AdsRepository(),
) : ViewModel() {
    private val _forYou = MutableStateFlow(HomeUiState())
    private val _following = MutableStateFlow(HomeUiState())

    private val _activeTab = MutableStateFlow(FeedTab.FOR_YOU)
    val activeTab: StateFlow<FeedTab> = _activeTab.asStateFlow()

    val forYouState: StateFlow<HomeUiState> = _forYou.asStateFlow()
    val followingState: StateFlow<HomeUiState> = _following.asStateFlow()

    // Fetched once, the same way ProfileViewModel/FollowListViewModel
    // resolve "who am I" - lets PostCard show Delete instead of Report
    // on the signed-in user's own posts here too, matching the
    // website's shared PostCard.tsx (it renders on every feed, not
    // just the profile page).
    private val _ownUserId = MutableStateFlow<String?>(null)
    val ownUserId: StateFlow<String?> = _ownUserId.asStateFlow()

    // One sponsored post per feed load, shown in both tabs (page.tsx's
    // own ad slot isn't gated on feedType, unlike its For-You-only
    // discovery modules) - fetched once here rather than per-tab, since
    // it's the same single ad slot regardless of which tab is active.
    private val _ad = MutableStateFlow<ServedAd?>(null)
    val ad: StateFlow<ServedAd?> = _ad.asStateFlow()
    private var adImpressionLogged = false

    init {
        refresh(FeedTab.FOR_YOU)
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _ownUserId.value = id }
        }
        viewModelScope.launch { _ad.value = adsRepository.serveAd() }
    }

    // Deduped the same way ViewedPostsTracker dedupes post view counts -
    // a boolean here rather than a whole tracker, since there's only
    // ever one ad slot per HomeViewModel instance, not many.
    fun logAdImpression() {
        val campaignId = _ad.value?.campaignId ?: return
        if (adImpressionLogged) return
        adImpressionLogged = true
        viewModelScope.launch { adsRepository.logImpression(campaignId) }
    }

    fun logAdClick(onResult: (redirectUrl: String?) -> Unit) {
        val campaignId = _ad.value?.campaignId ?: return
        viewModelScope.launch { onResult(adsRepository.logClick(campaignId)) }
    }

    fun selectTab(tab: FeedTab) {
        _activeTab.value = tab
        val state = stateFlowFor(tab).value
        if (state.posts.isEmpty() && !state.isRefreshing) {
            refresh(tab)
        }
    }

    fun refresh(tab: FeedTab = _activeTab.value) {
        val stateFlow = stateFlowFor(tab)
        stateFlow.update { it.copy(isRefreshing = true, error = null) }
        viewModelScope.launch {
            fetch(tab, cursor = null)
                .onSuccess { page -> applyFreshPage(stateFlow, page) }
                .onFailure { error ->
                    stateFlow.update {
                        it.copy(isRefreshing = false, error = error.message ?: "Couldn't load posts.")
                    }
                }
        }
    }

    fun loadMore(tab: FeedTab = _activeTab.value) {
        val stateFlow = stateFlowFor(tab)
        val current = stateFlow.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        stateFlow.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            fetch(tab, cursor = current.nextCursor)
                .onSuccess { page -> applyAppendedPage(stateFlow, page) }
                .onFailure { error ->
                    stateFlow.update {
                        it.copy(isLoadingMore = false, error = error.message ?: "Couldn't load more posts.")
                    }
                }
        }
    }

    fun toggleLike(tab: FeedTab, postId: String) {
        val stateFlow = stateFlowFor(tab)
        val previousPosts = stateFlow.value.posts

        // Optimistic update, same as the website's own post cards - the
        // like endpoint is a plain toggle, so a failed request just
        // rolls the flag/count back rather than needing a full refetch.
        stateFlow.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticLike(post) else post })
        }

        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                stateFlow.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleRepost(tab: FeedTab, postId: String) {
        val stateFlow = stateFlowFor(tab)
        val previousPosts = stateFlow.value.posts

        // Same optimistic-toggle-with-rollback shape as toggleLike - the
        // repost endpoint is a plain toggle too.
        stateFlow.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticRepost(post) else post })
        }

        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                stateFlow.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleBookmark(tab: FeedTab, postId: String) {
        val stateFlow = stateFlowFor(tab)
        val previousPosts = stateFlow.value.posts

        stateFlow.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticBookmark(post) else post })
        }

        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                stateFlow.update { it.copy(posts = previousPosts) }
            }
        }
    }

    // A deleted post disappears from the feed the moment the server
    // confirms it, the same as the website's own onUpdate(deletedPostId)
    // callback - no optimistic removal, since there's nothing sensible
    // to roll back to if the delete actually fails (re-inserting a post
    // at its old scroll position reads as more broken than just leaving
    // it visible until the real answer comes back).
    fun deletePost(tab: FeedTab, postId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deletePost(postId)
            result.onSuccess {
                val stateFlow = stateFlowFor(tab)
                stateFlow.update { it.copy(posts = it.posts.filterNot { post -> post.id == postId }) }
            }
            onResult(result)
        }
    }

    fun reportPost(postId: String, reason: String, details: String?, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(repository.reportPost(postId, reason, details))
        }
    }

    // Single-select, one vote per user - blocked client-side the same
    // way Poll.tsx's own `if (selected !== null) return` guards it,
    // matching the server's permanent PollVote unique constraint.
    // Updates both tabs' cached state, same reasoning as editPost below
    // (the same poll-post can legitimately appear in both).
    // Wrapped in try/catch end to end - see PollMath.kt's own KDoc on
    // why: a poll vote's local optimistic state update must never crash
    // the whole app even on malformed data this function didn't
    // anticipate (a corrupted votes map, a poll whose option count
    // doesn't match its votes keys). Worst case the tap silently
    // doesn't register locally and the user taps again - the same
    // recoverable outcome as a plain network failure below, instead of
    // the app closing.
    fun votePoll(postId: String, pollId: String, optionIndex: Int) {
        try {
            val alreadyVoted = hasAlreadyVotedOnPost(_forYou.value.posts + _following.value.posts, postId)
            if (alreadyVoted) return

            val previousForYou = _forYou.value.posts
            val previousFollowing = _following.value.posts
            _forYou.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) applyOptimisticVote(post, optionIndex) else post }) }
            _following.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) applyOptimisticVote(post, optionIndex) else post }) }

            viewModelScope.launch {
                repository.votePoll(pollId, optionIndex).onFailure {
                    _forYou.update { it.copy(posts = previousForYou) }
                    _following.update { it.copy(posts = previousFollowing) }
                }
            }
        } catch (e: Exception) {
            // Nothing to revert to here - the optimistic update either
            // never applied or already crashed a step it can't undo
            // blindly, so this only guarantees the exception stops here
            // instead of propagating up through Compose.
        }
    }

    // Updates the edited post's content in both tabs' cached state, not
    // just the active one - the same post can legitimately appear in
    // both For You and Following. Applies the submitted content
    // locally (post.copy) rather than replacing with the server's
    // returned object: PUT /posts/{id} never carries a liked/reposted/
    // bookmarked flag (same as GET /posts/{id} - see Post's own KDoc),
    // so swapping in that object wholesale would silently reset those
    // already-known client-side flags back to "unknown" on this post.
    fun editPost(postId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.updatePost(postId, content)
                .onSuccess {
                    _forYou.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) post.copy(content = content) else post }) }
                    _following.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) post.copy(content = content) else post }) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    private fun applyOptimisticBookmark(post: Post): Post {
        return post.copy(bookmarked = post.bookmarked != true)
    }

    private fun applyFreshPage(stateFlow: MutableStateFlow<HomeUiState>, page: PostsPage) {
        stateFlow.update {
            it.copy(
                posts = page.posts,
                nextCursor = page.nextCursor,
                isRefreshing = false,
                endReached = page.nextCursor == null,
            )
        }
    }

    private fun applyAppendedPage(stateFlow: MutableStateFlow<HomeUiState>, page: PostsPage) {
        stateFlow.update {
            it.copy(
                posts = it.posts + page.posts,
                nextCursor = page.nextCursor,
                isLoadingMore = false,
                endReached = page.nextCursor == null,
            )
        }
    }

    private fun applyOptimisticLike(post: Post): Post {
        val wasLiked = post.liked == true
        return post.copy(
            liked = !wasLiked,
            _count = post._count.copy(likes = post._count.likes + if (wasLiked) -1 else 1),
        )
    }

    private fun applyOptimisticRepost(post: Post): Post {
        val wasReposted = post.reposted == true
        return post.copy(
            reposted = !wasReposted,
            _count = post._count.copy(reposts = post._count.reposts + if (wasReposted) -1 else 1),
        )
    }

    private suspend fun fetch(tab: FeedTab, cursor: String?) = when (tab) {
        FeedTab.FOR_YOU -> repository.getForYouFeed(cursor)
        FeedTab.FOLLOWING -> repository.getFollowingFeed(cursor)
    }

    private fun stateFlowFor(tab: FeedTab): MutableStateFlow<HomeUiState> = when (tab) {
        FeedTab.FOR_YOU -> _forYou
        FeedTab.FOLLOWING -> _following
    }
}
