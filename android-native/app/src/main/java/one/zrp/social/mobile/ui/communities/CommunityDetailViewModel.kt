package one.zrp.social.mobile.ui.communities

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PollVoteUser

data class CommunityDetailUiState(
    val community: CommunitySummary? = null,
    val isMember: Boolean = false,
    val myRole: String? = null,
    val notFound: Boolean = false,
    val isLoading: Boolean = true,
    val posts: List<Post> = emptyList(),
    val isFeedLoading: Boolean = true,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
)

class CommunityDetailViewModel(
    private val communityId: String,
    private val repository: CommunitiesRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(CommunityDetailUiState())
    val state: StateFlow<CommunityDetailUiState> = _state.asStateFlow()

    init {
        loadCommunity()
        loadFeed()
    }

    fun loadCommunity() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getCommunity(communityId)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            community = response.community,
                            isMember = response.isMember,
                            myRole = response.myRole,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun loadFeed() {
        _state.update { it.copy(isFeedLoading = true) }
        viewModelScope.launch {
            repository.getCommunityFeed(communityId, null)
                .onSuccess { page ->
                    _state.update {
                        it.copy(posts = page.posts, nextCursor = page.nextCursor, isFeedLoading = false, endReached = page.nextCursor == null)
                    }
                }
                .onFailure { _state.update { it.copy(isFeedLoading = false) } }
        }
    }

    fun loadMoreFeed() {
        val cursor = _state.value.nextCursor ?: return
        if (_state.value.endReached) return
        viewModelScope.launch {
            repository.getCommunityFeed(communityId, cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(posts = it.posts + page.posts, nextCursor = page.nextCursor, endReached = page.nextCursor == null)
                    }
                }
        }
    }

    fun toggleMembership() {
        val wasMember = _state.value.isMember
        _state.update { state ->
            state.copy(
                isMember = !wasMember,
                community = state.community?.let { it.copy(memberCount = it.memberCount + if (wasMember) -1 else 1) },
            )
        }
        viewModelScope.launch {
            val result = if (wasMember) repository.leaveCommunity(communityId) else repository.joinCommunity(communityId)
            result.onFailure { loadCommunity() }
        }
    }

    fun toggleLike(postId: String) {
        val previous = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) applyOptimisticLike(it) else it }) }
        viewModelScope.launch { repository.toggleLike(postId).onFailure { _state.update { it.copy(posts = previous) } } }
    }

    fun toggleRepost(postId: String) {
        val previous = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) applyOptimisticRepost(it) else it }) }
        viewModelScope.launch { repository.toggleRepost(postId).onFailure { _state.update { it.copy(posts = previous) } } }
    }

    fun toggleBookmark(postId: String) {
        val previous = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) it.copy(bookmarked = it.bookmarked != true) else it }) }
        viewModelScope.launch { repository.toggleBookmark(postId).onFailure { _state.update { it.copy(posts = previous) } } }
    }

    fun votePoll(postId: String, pollId: String, optionIndex: Int) {
        val alreadyVoted = _state.value.posts.firstOrNull { it.id == postId }?.poll?.userVoteIndex != null
        if (alreadyVoted) return
        val previous = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) applyOptimisticVote(it, optionIndex) else it }) }
        viewModelScope.launch { repository.votePoll(pollId, optionIndex).onFailure { _state.update { it.copy(posts = previous) } } }
    }

    fun reportPost(postId: String, reason: String, details: String?, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch { onResult(repository.reportPost(postId, reason, details)) }
    }

    private fun applyOptimisticLike(post: Post): Post {
        val wasLiked = post.liked == true
        return post.copy(liked = !wasLiked, _count = post._count.copy(likes = post._count.likes + if (wasLiked) -1 else 1))
    }

    private fun applyOptimisticRepost(post: Post): Post {
        val wasReposted = post.reposted == true
        return post.copy(reposted = !wasReposted, _count = post._count.copy(reposts = post._count.reposts + if (wasReposted) -1 else 1))
    }

    private fun applyOptimisticVote(post: Post, optionIndex: Int): Post {
        val poll = post.poll ?: return post
        val key = optionIndex.toString()
        val newVotes = (poll.votes ?: emptyMap()) + (key to ((poll.votes?.get(key) ?: 0) + 1))
        return post.copy(poll = poll.copy(votes = newVotes, votes_user = listOf(PollVoteUser(optionIndex))))
    }
}

class CommunityDetailViewModelFactory(
    private val communityId: String,
    private val repository: CommunitiesRepository,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return CommunityDetailViewModel(communityId, repository) as T
    }
}
