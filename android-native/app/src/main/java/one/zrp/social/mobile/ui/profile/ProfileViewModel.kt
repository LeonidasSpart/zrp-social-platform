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
import one.zrp.social.mobile.network.PollVoteUser
import one.zrp.social.mobile.network.UserPostStats
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.network.UserReply

/**
 * Which upload just failed - CreatePostScreen's own MediaValidationError
 * uses the same "ViewModel can't resolve string resources" reasoning:
 * the Composable maps this to the real, translated profile.upload*
 * Failed string.
 */
enum class MediaUploadTarget { AVATAR, BANNER }

// Matches page.tsx's own TabType - the profile page's five real content
// tabs plus ANALYTICS, which page.tsx's visibleTabs filter keeps to the
// signed-in user's own profile and which ProfileTabRow gates the same
// way (its endpoint is session-scoped, so there is no other profile it
// could ever describe).
enum class ProfileTab { POSTS, REPLIES, MEDIA, LIKES, REPOSTS, ANALYTICS }

data class ProfileTabPostsState(
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
)

data class ProfileRepliesState(
    val replies: List<UserReply> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
)

// The Analytics tab is a single unpaginated snapshot (GET
// /user/posts/stats returns the 20 most recent posts and the totals
// over exactly those), so it has no cursor and no endReached - unlike
// every other tab's state.
data class ProfileAnalyticsState(
    val stats: UserPostStats? = null,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val failed: Boolean = false,
)

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
    val isFollowRequested: Boolean = false,
    val isTogglingBlock: Boolean = false,
    val isMuted: Boolean = false,
    val isTogglingMute: Boolean = false,
    val error: String? = null,
    val isUploadingAvatar: Boolean = false,
    val isUploadingBanner: Boolean = false,
    val mediaUploadError: MediaUploadTarget? = null,
    val selectedTab: ProfileTab = ProfileTab.POSTS,
    val repliesTab: ProfileRepliesState = ProfileRepliesState(),
    val mediaTab: ProfileTabPostsState = ProfileTabPostsState(),
    val likesTab: ProfileTabPostsState = ProfileTabPostsState(),
    val repostsTab: ProfileTabPostsState = ProfileTabPostsState(),
    val analyticsTab: ProfileAnalyticsState = ProfileAnalyticsState(),
    // PostCard.tsx computes post ownership per-post
    // (session.user.id === post.author.id), never from which profile
    // is being viewed - it has to, since a signed-in user's own posts
    // can surface on someone ELSE's Likes/Reposts tab (their own posts
    // that other person liked/reposted), and that person's Likes/
    // Reposts tabs can just as easily surface posts the signed-in user
    // does NOT own. Matches that per-post check here instead of the
    // per-profile isOwnProfile shortcut that only happens to be correct
    // on the Posts tab (every post there is authored by the profile
    // being viewed, by construction of GET /users/{username}/posts).
    val ownUserId: String? = null,
)

// Applies a transform to a post wherever it may currently be held -
// the flat posts list, the pinned slot, and any of the three tabs that
// can independently hold the same Post object (media/likes/reposts) -
// so a like/repost/bookmark/edit stays consistent no matter which tab
// the user is looking at when they act on it.
private fun ProfileUiState.mapPost(postId: String, transform: (Post) -> Post): ProfileUiState {
    fun mapList(posts: List<Post>) = posts.map { if (it.id == postId) transform(it) else it }
    return copy(
        posts = mapList(posts),
        pinnedPost = pinnedPost?.let { if (it.id == postId) transform(it) else it },
        mediaTab = mediaTab.copy(posts = mapList(mediaTab.posts)),
        likesTab = likesTab.copy(posts = mapList(likesTab.posts)),
        repostsTab = repostsTab.copy(posts = mapList(repostsTab.posts)),
    )
}

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
                            ownUserId = if (isOwnProfile) profile.id else it.ownUserId,
                            selectedTab = ProfileTab.POSTS,
                            repliesTab = ProfileRepliesState(),
                            mediaTab = ProfileTabPostsState(),
                            likesTab = ProfileTabPostsState(),
                            repostsTab = ProfileTabPostsState(),
                            analyticsTab = ProfileAnalyticsState(),
                        )
                    }
                    if (!isOwnProfile) {
                        loadMuteStatus(profile.id)
                        repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
                    }
                    loadPosts(username, refresh = true)
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
        viewModelScope.launch {
            val username = resolveUsername() ?: return@launch
            loadPosts(username, refresh = true)
        }
    }

    // Pull-to-refresh refreshes whichever tab is on screen, not always
    // Posts - the same "refresh what you're looking at" behavior
    // HomeScreen's own refresh button gives the feed. For the own-
    // profile case this also re-resolves the username rather than
    // trusting resolvedUsername's cached value - this ViewModel can
    // outlive an in-app rename (it's kept alive across bottom-nav tab
    // switches), so a pull-to-refresh is the recovery path for a
    // profile screen that was already open before the rename.
    fun refreshSelectedTab() {
        viewModelScope.launch {
            val username = resolveUsername() ?: return@launch
            when (_state.value.selectedTab) {
                ProfileTab.POSTS -> loadPosts(username, refresh = true)
                ProfileTab.REPLIES -> loadReplies(username, refresh = true)
                ProfileTab.MEDIA -> loadMedia(username, refresh = true)
                ProfileTab.LIKES -> loadLikes(username, refresh = true)
                ProfileTab.REPOSTS -> loadReposts(username, refresh = true)
                ProfileTab.ANALYTICS -> loadAnalytics()
            }
        }
    }

    // Own-profile resolution always re-checks the current username
    // (see ProfileRepository.getOwnUsername's own override) rather than
    // trusting a previously cached resolvedUsername forever - someone
    // else's profile is always keyed by the fixed requestedUsername
    // passed in at navigation time, which never changes.
    private suspend fun resolveUsername(): String? {
        if (requestedUsername != null) return requestedUsername
        return repository.getOwnUsername()
            .onSuccess { resolvedUsername = it }
            .getOrNull() ?: resolvedUsername
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

    // Switching tabs never re-fetches a tab that already has content -
    // matches page.tsx's own fetchPosts effect, which re-runs only when
    // [username, activeTab] changes, so a tab visited once keeps its
    // list until the next pull-to-refresh.
    fun selectTab(tab: ProfileTab) {
        if (_state.value.selectedTab == tab) return
        _state.update { it.copy(selectedTab = tab) }
        val username = resolvedUsername ?: return
        when (tab) {
            ProfileTab.POSTS -> Unit
            ProfileTab.REPLIES -> if (!_state.value.repliesTab.hasLoaded) loadReplies(username, refresh = true)
            ProfileTab.MEDIA -> if (!_state.value.mediaTab.hasLoaded) loadMedia(username, refresh = true)
            ProfileTab.LIKES -> if (!_state.value.likesTab.hasLoaded) loadLikes(username, refresh = true)
            ProfileTab.REPOSTS -> if (!_state.value.repostsTab.hasLoaded) loadReposts(username, refresh = true)
            ProfileTab.ANALYTICS -> if (!_state.value.analyticsTab.hasLoaded) loadAnalytics()
        }
    }

    // Infinite-scroll continuation for whichever tab is currently
    // selected - the LazyColumn's own near-bottom effect calls this
    // instead of loadMore() once tabs exist, the same way page.tsx's
    // single fetchPosts effect serves whichever activeTab is current.
    fun loadMoreSelectedTab() {
        val username = resolvedUsername ?: return
        when (_state.value.selectedTab) {
            ProfileTab.POSTS -> loadMore()
            ProfileTab.REPLIES -> {
                val tab = _state.value.repliesTab
                if (!tab.isLoading && !tab.endReached && tab.nextCursor != null) loadReplies(username, refresh = false)
            }
            ProfileTab.MEDIA -> {
                val tab = _state.value.mediaTab
                if (!tab.isLoading && !tab.endReached && tab.nextCursor != null) loadMedia(username, refresh = false)
            }
            ProfileTab.LIKES -> {
                val tab = _state.value.likesTab
                if (!tab.isLoading && !tab.endReached && tab.nextCursor != null) loadLikes(username, refresh = false)
            }
            ProfileTab.REPOSTS -> {
                val tab = _state.value.repostsTab
                if (!tab.isLoading && !tab.endReached && tab.nextCursor != null) loadReposts(username, refresh = false)
            }
            // Analytics is a single unpaginated snapshot (see
            // ProfileAnalyticsState) - there is nothing to continue.
            ProfileTab.ANALYTICS -> Unit
        }
    }

    // GET /user/posts/stats resolves the author from the session, so
    // unlike every other tab's loader this takes no username - and it
    // is only ever reachable from the own-profile tab row.
    private fun loadAnalytics() {
        _state.update { it.copy(analyticsTab = it.analyticsTab.copy(isLoading = true, failed = false)) }
        viewModelScope.launch {
            repository.getOwnPostStats()
                .onSuccess { stats ->
                    _state.update {
                        it.copy(
                            analyticsTab = it.analyticsTab.copy(
                                stats = stats,
                                isLoading = false,
                                hasLoaded = true,
                                failed = false,
                            ),
                        )
                    }
                }
                .onFailure {
                    _state.update {
                        it.copy(
                            analyticsTab = it.analyticsTab.copy(
                                isLoading = false,
                                hasLoaded = true,
                                failed = true,
                            ),
                        )
                    }
                }
        }
    }

    private fun loadReplies(username: String, refresh: Boolean) {
        _state.update { it.copy(repliesTab = it.repliesTab.copy(isLoading = true)) }
        viewModelScope.launch {
            val cursor = if (refresh) null else _state.value.repliesTab.nextCursor
            repository.getUserReplies(username, cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            repliesTab = it.repliesTab.copy(
                                replies = if (refresh) page.replies else it.repliesTab.replies + page.replies,
                                nextCursor = page.nextCursor,
                                isLoading = false,
                                hasLoaded = true,
                                endReached = page.nextCursor == null,
                            ),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(repliesTab = it.repliesTab.copy(isLoading = false, hasLoaded = true)) } }
        }
    }

    private fun loadMedia(username: String, refresh: Boolean) {
        _state.update { it.copy(mediaTab = it.mediaTab.copy(isLoading = true)) }
        viewModelScope.launch {
            val cursor = if (refresh) null else _state.value.mediaTab.nextCursor
            repository.getUserMedia(username, cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            mediaTab = it.mediaTab.copy(
                                posts = if (refresh) page.posts else it.mediaTab.posts + page.posts,
                                nextCursor = page.nextCursor,
                                isLoading = false,
                                hasLoaded = true,
                                endReached = page.nextCursor == null,
                            ),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(mediaTab = it.mediaTab.copy(isLoading = false, hasLoaded = true)) } }
        }
    }

    private fun loadLikes(username: String, refresh: Boolean) {
        _state.update { it.copy(likesTab = it.likesTab.copy(isLoading = true)) }
        viewModelScope.launch {
            val cursor = if (refresh) null else _state.value.likesTab.nextCursor
            repository.getUserLikes(username, cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            likesTab = it.likesTab.copy(
                                posts = if (refresh) page.posts else it.likesTab.posts + page.posts,
                                nextCursor = page.nextCursor,
                                isLoading = false,
                                hasLoaded = true,
                                endReached = page.nextCursor == null,
                            ),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(likesTab = it.likesTab.copy(isLoading = false, hasLoaded = true)) } }
        }
    }

    private fun loadReposts(username: String, refresh: Boolean) {
        _state.update { it.copy(repostsTab = it.repostsTab.copy(isLoading = true)) }
        viewModelScope.launch {
            val cursor = if (refresh) null else _state.value.repostsTab.nextCursor
            repository.getUserReposts(username, cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            repostsTab = it.repostsTab.copy(
                                posts = if (refresh) page.posts else it.repostsTab.posts + page.posts,
                                nextCursor = page.nextCursor,
                                isLoading = false,
                                hasLoaded = true,
                                endReached = page.nextCursor == null,
                            ),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(repostsTab = it.repostsTab.copy(isLoading = false, hasLoaded = true)) } }
        }
    }

    // Matches page.tsx's own local-only followRequestStatus: the profile
    // GET response never actually carries a pending-request flag (web's
    // own `data.followRequestStatus || "none"` read is dead code, since
    // route.ts never sets that field), so a freshly-opened private
    // profile that already has a pending request from a previous visit
    // shows a plain Follow button on both platforms alike until clicked
    // again - a real web limitation this mirrors rather than "fixes"
    // unilaterally on native only.
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
                            isFollowRequested = result.requested,
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
        val previous = _state.value
        _state.update { it.mapPost(postId, ::applyOptimisticLike) }

        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                _state.update { current -> current.copy(
                    posts = previous.posts,
                    pinnedPost = previous.pinnedPost,
                    mediaTab = previous.mediaTab,
                    likesTab = previous.likesTab,
                    repostsTab = previous.repostsTab,
                ) }
            }
        }
    }

    // Single-select, one vote per user - blocked client-side the same
    // way Poll.tsx's own `if (selected !== null) return` guards it.
    fun votePoll(postId: String, pollId: String, optionIndex: Int) {
        val current = _state.value
        val alreadyVoted = (current.posts + current.mediaTab.posts + current.likesTab.posts + current.repostsTab.posts + listOfNotNull(current.pinnedPost))
            .firstOrNull { it.id == postId }?.poll?.userVoteIndex != null
        if (alreadyVoted) return

        val previous = current
        _state.update { it.mapPost(postId) { post -> applyOptimisticVote(post, optionIndex) } }

        viewModelScope.launch {
            repository.votePoll(pollId, optionIndex).onFailure {
                _state.update { curr -> curr.copy(
                    posts = previous.posts,
                    pinnedPost = previous.pinnedPost,
                    mediaTab = previous.mediaTab,
                    likesTab = previous.likesTab,
                    repostsTab = previous.repostsTab,
                ) }
            }
        }
    }

    fun toggleRepost(postId: String) {
        val previous = _state.value
        _state.update { it.mapPost(postId, ::applyOptimisticRepost) }

        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                _state.update { current -> current.copy(
                    posts = previous.posts,
                    pinnedPost = previous.pinnedPost,
                    mediaTab = previous.mediaTab,
                    likesTab = previous.likesTab,
                    repostsTab = previous.repostsTab,
                ) }
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
        val previous = _state.value
        _state.update { it.mapPost(postId, ::applyOptimisticBookmark) }

        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                _state.update { current -> current.copy(
                    posts = previous.posts,
                    pinnedPost = previous.pinnedPost,
                    mediaTab = previous.mediaTab,
                    likesTab = previous.likesTab,
                    repostsTab = previous.repostsTab,
                ) }
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
                        mediaTab = it.mediaTab.copy(posts = it.mediaTab.posts.filterNot { post -> post.id == postId }),
                        likesTab = it.likesTab.copy(posts = it.likesTab.posts.filterNot { post -> post.id == postId }),
                        repostsTab = it.repostsTab.copy(posts = it.repostsTab.posts.filterNot { post -> post.id == postId }),
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
                    _state.update { it.mapPost(postId) { post -> post.copy(content = content) } }
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

    // The vote endpoint returns only {success: true} - no updated
    // counts (see Poll's own KDoc) - so the +1 is applied locally the
    // same way applyOptimisticLike bumps a like count.
    private fun applyOptimisticVote(post: Post, optionIndex: Int): Post {
        val poll = post.poll ?: return post
        val key = optionIndex.toString()
        val newVotes = (poll.votes ?: emptyMap()) + (key to ((poll.votes?.get(key) ?: 0) + 1))
        return post.copy(poll = poll.copy(votes = newVotes, votes_user = listOf(PollVoteUser(optionIndex))))
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
