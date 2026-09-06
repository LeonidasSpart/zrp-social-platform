package one.zrp.social.mobile.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.UserProfile

data class ProfileUiState(
    val isOwnProfile: Boolean = false,
    val profile: UserProfile? = null,
    val posts: List<Post> = emptyList(),
    val isLoadingProfile: Boolean = true,
    val isRefreshingPosts: Boolean = false,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isTogglingFollow: Boolean = false,
    val isTogglingBlock: Boolean = false,
    val isMuted: Boolean = false,
    val isTogglingMute: Boolean = false,
    val error: String? = null,
)

/**
 * Drives a single profile screen instance - either the signed-in
 * user's own profile (requestedUsername null, resolved through the
 * real NextAuth session endpoint) or someone else's (requestedUsername
 * passed directly, e.g. from tapping a post's author).
 */
class ProfileViewModel(
    private val repository: ProfileRepository,
    private val requestedUsername: String?,
) : ViewModel() {
    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    private var resolvedUsername: String? = requestedUsername

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingProfile = true, error = null) }

            val username = resolvedUsername ?: repository.getOwnUsername()
                .onSuccess { resolvedUsername = it }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoadingProfile = false, error = error.message ?: "Couldn't load your profile.")
                    }
                }
                .getOrNull()

            if (username == null) return@launch

            repository.getProfile(username)
                .onSuccess { profile ->
                    val isOwnProfile = requestedUsername == null
                    _state.update {
                        it.copy(
                            profile = profile,
                            isOwnProfile = isOwnProfile,
                            isLoadingProfile = false,
                        )
                    }
                    loadPosts(username, refresh = true)
                    if (!isOwnProfile) loadMuteStatus(profile.id)
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoadingProfile = false, error = error.message ?: "Couldn't load this profile.")
                    }
                }
        }
    }

    fun refreshPosts() {
        val username = resolvedUsername ?: return
        loadPosts(username, refresh = true)
    }

    fun loadMore() {
        val username = resolvedUsername ?: return
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getUserPosts(username, current.nextCursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            posts = it.posts + page.posts,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoadingMore = false, error = error.message ?: "Couldn't load more posts.")
                    }
                }
        }
    }

    fun toggleFollow() {
        val username = resolvedUsername ?: return
        val profile = _state.value.profile ?: return
        if (_state.value.isTogglingFollow) return

        _state.update { it.copy(isTogglingFollow = true) }
        viewModelScope.launch {
            repository.toggleFollow(username)
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            isTogglingFollow = false,
                            profile = profile.copy(isFollowing = result.following),
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(isTogglingFollow = false) }
                }
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

    fun toggleBlock() {
        val username = resolvedUsername ?: return
        val profile = _state.value.profile ?: return
        if (_state.value.isTogglingBlock) return

        _state.update { it.copy(isTogglingBlock = true) }
        viewModelScope.launch {
            repository.toggleBlock(username)
                .onSuccess { result ->
                    _state.update {
                        it.copy(isTogglingBlock = false, profile = profile.copy(isBlocked = result.blocked))
                    }
                }
                .onFailure {
                    _state.update { it.copy(isTogglingBlock = false) }
                }
        }
    }

    private fun loadMuteStatus(userId: String) {
        viewModelScope.launch {
            repository.getMuteStatus(userId).onSuccess { muted ->
                _state.update { it.copy(isMuted = muted) }
            }
        }
    }

    fun toggleMute() {
        val profile = _state.value.profile ?: return
        if (_state.value.isTogglingMute) return

        _state.update { it.copy(isTogglingMute = true) }
        viewModelScope.launch {
            repository.toggleMute(profile.id)
                .onSuccess { muted -> _state.update { it.copy(isTogglingMute = false, isMuted = muted) } }
                .onFailure { _state.update { it.copy(isTogglingMute = false) } }
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

    private fun loadPosts(username: String, refresh: Boolean) {
        viewModelScope.launch {
            if (refresh) _state.update { it.copy(isRefreshingPosts = true) }
            repository.getUserPosts(username, cursor = if (refresh) null else _state.value.nextCursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            posts = page.posts,
                            nextCursor = page.nextCursor,
                            isRefreshingPosts = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isRefreshingPosts = false, error = error.message ?: "Couldn't load posts.")
                    }
                }
        }
    }
}
