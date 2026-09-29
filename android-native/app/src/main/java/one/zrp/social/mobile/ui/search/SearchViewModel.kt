package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.ListingSummary
import one.zrp.social.mobile.network.NewsArticleSummary
import one.zrp.social.mobile.network.OpportunitySummary
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PollVoteUser
import one.zrp.social.mobile.network.SearchMusicResult
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.TrendingHashtag

data class SearchUiState(
    val query: String = "",
    // Advanced Search category/sort/filters - see docs/advanced-search-
    // architecture.md for the shared contract this mirrors exactly.
    val category: SearchCategory = SearchCategory.ALL,
    val sort: SearchSort = SearchSort.RELEVANCE,
    val filters: SearchFilters = SearchFilters(),
    val showFilters: Boolean = false,
    val isSearching: Boolean = false,
    val isLoadingMore: Boolean = false,
    // Single-category pagination (category != ALL only - type=all is a
    // fixed-size teaser server-side and ignores cursor).
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    // Backs BOTH type=all's per-category teaser AND the active single
    // category's full paginated list - only the field(s) matching the
    // current `category` are ever populated at once, so one set of
    // fields serves both display modes without duplicating state.
    val users: List<SearchUser> = emptyList(),
    val posts: List<Post> = emptyList(),
    val hashtags: List<TrendingHashtag> = emptyList(),
    val communities: List<CommunitySummary> = emptyList(),
    val news: List<NewsArticleSummary> = emptyList(),
    val music: List<SearchMusicResult> = emptyList(),
    val opportunities: List<OpportunitySummary> = emptyList(),
    val marketplace: List<ListingSummary> = emptyList(),
    // type=all's per-category nextCursor - what a "See all" tap needs to
    // know there's more before switching into single-category mode.
    val allModeNextCursors: Map<String, String?> = emptyMap(),
    val suggestedUsers: List<SearchUser> = emptyList(),
    val trendingHashtags: List<TrendingHashtag> = emptyList(),
    val isLoadingDiscover: Boolean = true,
    val error: String? = null,
    val ownUserId: String? = null,
)

/**
 * Backs the Search tab: the same real /search endpoint the website
 * uses for typed queries (debounced client-side so every keystroke
 * doesn't fire a request, matching the server's own 2-character
 * minimum), plus the suggested-users/trending-hashtags endpoints the
 * Home feed's own widgets already reuse for the pre-search "Discover"
 * state. Advanced Search adds category tabs, a sort dropdown, a filter
 * panel and real cursor-based pagination once a single category is
 * selected - query/category/sort/filters changes all funnel through the
 * same debounced `scheduleSearch()` pipeline, matching the web page's
 * own single fetch-effect.
 */
class SearchViewModel(private val repository: SearchRepository) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadDiscover()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        scheduleSearch()
    }

    fun onCategorySelect(category: SearchCategory) {
        if (_state.value.category == category) return
        _state.update { it.copy(category = category, nextCursor = null, endReached = false) }
        rerunIfSearchable()
    }

    fun onSortSelect(sort: SearchSort) {
        if (_state.value.sort == sort) return
        _state.update { it.copy(sort = sort, nextCursor = null, endReached = false) }
        rerunIfSearchable()
    }

    fun onFiltersChange(filters: SearchFilters) {
        _state.update { it.copy(filters = filters, nextCursor = null, endReached = false) }
        rerunIfSearchable()
    }

    fun onClearFilters() {
        onFiltersChange(SearchFilters())
    }

    fun onToggleFiltersPanel() {
        _state.update { it.copy(showFilters = !it.showFilters) }
    }

    fun onHashtagClick(tag: String) {
        onQueryChange(tag)
    }

    fun loadMore() {
        val s = _state.value
        if (!canLoadMoreSearch(s)) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            fetchCategory(s.category, s.query.trim(), s.nextCursor, append = true)
        }
    }

    // Cancels and replaces `searchJob` the same way scheduleSearch() does
    // - without tracking the new job here too, a rapid category/sort/
    // filter change could leave two fetches racing, and the slower one
    // (for a since-abandoned selection) could win and overwrite the UI
    // with results for a category/sort the user is no longer viewing.
    private fun rerunIfSearchable() {
        searchJob?.cancel()
        val query = _state.value.query.trim()
        if (query.length >= 2) {
            searchJob = viewModelScope.launch { performSearch(query) }
        }
    }

    private fun scheduleSearch() {
        searchJob?.cancel()
        val trimmed = _state.value.query.trim()
        if (trimmed.length < 2) {
            _state.update {
                it.copy(
                    isSearching = false,
                    error = null,
                    users = emptyList(),
                    posts = emptyList(),
                    hashtags = emptyList(),
                    communities = emptyList(),
                    news = emptyList(),
                    music = emptyList(),
                    opportunities = emptyList(),
                    marketplace = emptyList(),
                    allModeNextCursors = emptyMap(),
                    nextCursor = null,
                    endReached = false,
                )
            }
            return
        }

        searchJob = viewModelScope.launch {
            delay(350)
            performSearch(trimmed)
        }
    }

    private suspend fun performSearch(query: String) {
        _state.update { it.copy(isSearching = true, error = null) }
        val category = _state.value.category
        if (category == SearchCategory.ALL) {
            val s = _state.value
            repository.searchAll(query, s.sort, s.filters)
                .onSuccess { r ->
                    _state.update {
                        it.copy(
                            isSearching = false,
                            users = r.users,
                            posts = r.posts,
                            hashtags = r.hashtags,
                            communities = r.communities,
                            news = r.news,
                            music = r.music,
                            opportunities = r.opportunities,
                            marketplace = r.marketplace,
                            allModeNextCursors = r.nextCursors ?: emptyMap(),
                            nextCursor = null,
                            endReached = true,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isSearching = false, error = error.message ?: "Search failed.") } }
        } else {
            fetchCategory(category, query, cursor = null, append = false)
        }
    }

    private suspend fun fetchCategory(category: SearchCategory, query: String, cursor: String?, append: Boolean) {
        when (category) {
            SearchCategory.ALL -> Unit
            SearchCategory.PEOPLE -> {
                val s = _state.value
                repository.searchUsersPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                users = if (append) it.users + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.POSTS -> {
                val s = _state.value
                repository.searchPostsPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                posts = if (append) it.posts + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.HASHTAGS -> {
                val s = _state.value
                repository.searchHashtagsPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                hashtags = if (append) it.hashtags + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.COMMUNITIES -> {
                val s = _state.value
                repository.searchCommunitiesPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                communities = if (append) it.communities + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.NEWS -> {
                val s = _state.value
                repository.searchNewsPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                news = if (append) it.news + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.MUSIC -> {
                val s = _state.value
                repository.searchMusicPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                music = if (append) it.music + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.OPPORTUNITIES -> {
                val s = _state.value
                repository.searchOpportunitiesPage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                opportunities = if (append) it.opportunities + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
            SearchCategory.MARKETPLACE -> {
                val s = _state.value
                repository.searchMarketplacePage(query, s.sort, s.filters, cursor)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                isSearching = false,
                                isLoadingMore = false,
                                marketplace = if (append) it.marketplace + page.results else page.results,
                                nextCursor = page.nextCursor,
                                endReached = page.nextCursor == null,
                            )
                        }
                    }
                    .onFailure { onCategoryError(it, append) }
            }
        }
    }

    private fun onCategoryError(error: Throwable, append: Boolean) {
        _state.update {
            it.copy(
                isSearching = false,
                isLoadingMore = false,
                error = if (append) it.error else (error.message ?: "Search failed."),
            )
        }
    }

    fun toggleLike(postId: String) {
        val previousPosts = _state.value.posts

        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticLike(post) else post })
        }

        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleRepost(postId: String) {
        val previousPosts = _state.value.posts

        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticRepost(post) else post })
        }

        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleBookmark(postId: String) {
        val previousPosts = _state.value.posts

        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticBookmark(post) else post })
        }

        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    // Single-select, one vote per user - blocked client-side the same
    // way Poll.tsx's own `if (selected !== null) return` guards it.
    fun votePoll(postId: String, pollId: String, optionIndex: Int) {
        val alreadyVoted = _state.value.posts.firstOrNull { it.id == postId }?.poll?.userVoteIndex != null
        if (alreadyVoted) return

        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticVote(post, optionIndex) else post })
        }

        viewModelScope.launch {
            repository.votePoll(pollId, optionIndex).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun deletePost(postId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deletePost(postId)
            result.onSuccess {
                _state.update { it.copy(posts = it.posts.filterNot { post -> post.id == postId }) }
            }
            onResult(result)
        }
    }

    fun reportPost(postId: String, reason: String, details: String?, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(repository.reportPost(postId, reason, details))
        }
    }

    // Applies the submitted content locally (post.copy) rather than
    // replacing with the server's returned object - PUT /posts/{id}
    // never carries a liked/reposted/bookmarked flag, so swapping in
    // that object wholesale would reset those already-known flags.
    fun editPost(postId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.updatePost(postId, content)
                .onSuccess {
                    _state.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) post.copy(content = content) else post }) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    private fun applyOptimisticBookmark(post: Post): Post {
        return post.copy(bookmarked = post.bookmarked != true)
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

    // The vote endpoint returns only {success: true} - no updated
    // counts (see Poll's own KDoc) - so the +1 is applied locally the
    // same way applyOptimisticLike bumps a like count.
    private fun applyOptimisticVote(post: Post, optionIndex: Int): Post {
        val poll = post.poll ?: return post
        val key = optionIndex.toString()
        val newVotes = (poll.votes ?: emptyMap()) + (key to ((poll.votes?.get(key) ?: 0) + 1))
        return post.copy(poll = poll.copy(votes = newVotes, votes_user = listOf(PollVoteUser(optionIndex))))
    }

    private fun loadDiscover() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingDiscover = true) }
            coroutineScope {
                val suggestedDeferred = async { repository.getSuggestedUsers() }
                val trendingDeferred = async { repository.getTrendingHashtags() }
                val suggested = suggestedDeferred.await()
                val trending = trendingDeferred.await()

                _state.update {
                    it.copy(
                        isLoadingDiscover = false,
                        suggestedUsers = suggested.getOrDefault(emptyList()),
                        trendingHashtags = trending.getOrDefault(emptyList()),
                    )
                }
            }
        }
    }
}

// Extracted as a pure function (matching CommentsViewModel's own
// canLoadMoreComments()) since no fake-repository/coroutine test seam
// exists for ViewModels in this module yet - this guard is exactly what
// loadMore() checks before firing a request: never for type=all (a
// fixed-size teaser server-side, not paginated), never while a page is
// already in flight, never once the server has said there's nothing
// left, and never before a first page (nextCursor) has ever loaded.
internal fun canLoadMoreSearch(state: SearchUiState): Boolean {
    return state.category != SearchCategory.ALL &&
        !state.isLoadingMore &&
        !state.endReached &&
        state.nextCursor != null &&
        state.query.trim().length >= 2
}
