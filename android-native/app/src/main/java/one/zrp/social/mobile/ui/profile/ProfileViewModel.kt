package one.zrp.social.mobile.ui.profile

import android.content.ContentResolver
import android.net.Uri
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

/**
 * Which upload just failed - CreatePostScreen's own MediaValidationError
 * uses the same "ViewModel can't resolve string resources" reasoning:
 * the Composable maps this to the real, translated profile.upload*
 * Failed string.
 */
enum class MediaUploadTarget { AVATAR, BANNER }

data class ProfileUiState(
    val isOwnProfile: Boolean = false,
    val profile: UserProfile? = null,
    val posts: List<Post> = emptyList(),
    val pinnedPost: Post? = null,
    val isTogglingPin: Boolean = false,
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
    val isUploadingAvatar: Boolean = false,
    val isUploadingBanner: Boolean = false,
    val mediaUploadError: MediaUploadTarget? = null,
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
                    val pinnedPostId = profile.pinnedPostId
                    if (pinnedPostId != null) loadPinnedPost(pinnedPostId) else _state.update { it.copy(pinnedPost = null) }
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
        val previousPinned = _state.value.pinnedPost

        _state.update { state ->
            state.copy(
                posts = state.posts.map { post -> if (post.id == postId) applyOptimisticLike(post) else post },
                pinnedPost = state.pinnedPost?.let { if (it.id == postId) applyOptimisticLike(it) else it },
            )
        }

        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                _state.update { it.copy(posts = previousPosts, pinnedPost = previousPinned) }
            }
        }
    }

    fun toggleRepost(postId: String) {
        val previousPosts = _state.value.posts
        val previousPinned = _state.value.pinnedPost

        _state.update { state ->
            state.copy(
                posts = state.posts.map { post -> if (post.id == postId) applyOptimisticRepost(post) else post },
                pinnedPost = state.pinnedPost?.let { if (it.id == postId) applyOptimisticRepost(it) else it },
            )
        }

        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                _state.update { it.copy(posts = previousPosts, pinnedPost = previousPinned) }
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
        val previousPinned = _state.value.pinnedPost

        _state.update { state ->
            state.copy(
                posts = state.posts.map { post -> if (post.id == postId) applyOptimisticBookmark(post) else post },
                pinnedPost = state.pinnedPost?.let { if (it.id == postId) applyOptimisticBookmark(it) else it },
            )
        }

        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                _state.update { it.copy(posts = previousPosts, pinnedPost = previousPinned) }
            }
        }
    }

    fun deletePost(postId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deletePost(postId)
            result.onSuccess {
                _state.update {
                    it.copy(
                        posts = it.posts.filterNot { post -> post.id == postId },
                        pinnedPost = it.pinnedPost?.takeUnless { pinned -> pinned.id == postId },
                    )
                }
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
                    _state.update {
                        it.copy(
                            posts = it.posts.map { post -> if (post.id == postId) post.copy(content = content) else post },
                            pinnedPost = it.pinnedPost?.let { pinned -> if (pinned.id == postId) pinned.copy(content = content) else pinned },
                        )
                    }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    // Pinning is single-slot server-side (User.pinnedPostId) - toggling
    // a post that's already pinned clears pinnedPost; toggling any other
    // post replaces it, so the newly-pinned post is looked up from
    // whichever list already has it (posts, or the previously pinned
    // post itself) rather than re-fetched.
    fun togglePin(postId: String) {
        if (_state.value.isTogglingPin) return
        val target = _state.value.posts.find { it.id == postId } ?: _state.value.pinnedPost?.takeIf { it.id == postId }
        _state.update { it.copy(isTogglingPin = true) }
        viewModelScope.launch {
            repository.togglePin(postId)
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            isTogglingPin = false,
                            pinnedPost = if (result.pinned) target else null,
                            profile = it.profile?.copy(pinnedPostId = if (result.pinned) postId else null),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isTogglingPin = false) } }
        }
    }

    private fun loadPinnedPost(postId: String) {
        viewModelScope.launch {
            repository.getPost(postId).onSuccess { post -> _state.update { it.copy(pinnedPost = post) } }
        }
    }

    // Matches the real profile page's own handleAvatarUpload/
    // handleBannerUpload: no client-side type/size validation at all -
    // the server (5MB cap, image-type allowlist) is the only real gate,
    // and a rejection just surfaces the same generic translated
    // failure web's own alert() shows, never a more specific invented
    // reason the server itself doesn't return structurally.
    fun uploadAvatar(contentResolver: ContentResolver, uri: Uri) {
        if (_state.value.isUploadingAvatar) return
        _state.update { it.copy(isUploadingAvatar = true, mediaUploadError = null) }
        viewModelScope.launch {
            repository.updateAvatar(contentResolver, uri)
                .onSuccess { url ->
                    _state.update {
                        it.copy(isUploadingAvatar = false, profile = it.profile?.copy(avatarUrl = url))
                    }
                }
                .onFailure {
                    _state.update {
                        it.copy(isUploadingAvatar = false, mediaUploadError = MediaUploadTarget.AVATAR)
                    }
                }
        }
    }

    fun uploadBanner(contentResolver: ContentResolver, uri: Uri) {
        if (_state.value.isUploadingBanner) return
        _state.update { it.copy(isUploadingBanner = true, mediaUploadError = null) }
        viewModelScope.launch {
            repository.updateCover(contentResolver, uri)
                .onSuccess { url ->
                    _state.update {
                        it.copy(isUploadingBanner = false, profile = it.profile?.copy(coverUrl = url))
                    }
                }
                .onFailure {
                    _state.update {
                        it.copy(isUploadingBanner = false, mediaUploadError = MediaUploadTarget.BANNER)
                    }
                }
        }
    }

    fun dismissMediaUploadError() {
        _state.update { it.copy(mediaUploadError = null) }
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
