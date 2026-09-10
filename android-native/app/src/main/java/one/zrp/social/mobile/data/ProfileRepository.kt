package one.zrp.social.mobile.data

import android.content.ContentResolver
import android.net.Uri
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BlockToggleResponse
import one.zrp.social.mobile.network.BlockedUser
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.FollowListPage
import one.zrp.social.mobile.network.FollowToggleResponse
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.MuteToggleRequest
import one.zrp.social.mobile.network.MutedUser
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PinToggleResponse
import one.zrp.social.mobile.network.PollVoteRequest
import one.zrp.social.mobile.network.PollVoteResponse
import one.zrp.social.mobile.network.PostStatsTotals
import one.zrp.social.mobile.network.RepliesPage
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.UpdatePostRequest
import one.zrp.social.mobile.network.UserPostStats
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.network.buildFileMultipart
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around UsersApi (and the shared like toggle) for the
 * Profile screen - the signed-in user's own profile or someone else's,
 * both backed by the same real endpoints the website uses.
 */
class ProfileRepository {
    suspend fun getOwnUsername(): Result<String> = runCatching {
        ApiClient.ownUsernameOverride ?: run {
            val session = ApiClient.authApi.getSession()
            session.user?.username ?: throw IllegalStateException("Not signed in")
        }
    }

    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getFollowers(username: String, cursor: String?): Result<FollowListPage> = runCatching {
        ApiClient.usersApi.getFollowers(username, cursor)
    }

    suspend fun getFollowing(username: String, cursor: String?): Result<FollowListPage> = runCatching {
        ApiClient.usersApi.getFollowing(username, cursor)
    }

    suspend fun getProfile(username: String): Result<UserProfile> = runCatching {
        ApiClient.usersApi.getProfile(username)
    }

    suspend fun getUserPosts(username: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.usersApi.getUserPosts(username, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    suspend fun getUserReplies(username: String, cursor: String?): Result<RepliesPage> = runCatching {
        val page = ApiClient.usersApi.getUserReplies(username, cursor)
        RepliesPage(replies = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    suspend fun getUserMedia(username: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.usersApi.getUserMedia(username, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    suspend fun getUserLikes(username: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.usersApi.getUserLikes(username, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    suspend fun getUserReposts(username: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.usersApi.getUserReposts(username, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    // The Analytics tab's own data. Session-scoped, so it takes no
    // username: the route derives the author from the signed-in
    // session, which is why the tab is own-profile-only on native
    // exactly as it is on web (page.tsx's visibleTabs filter). The
    // envelope's two fields are nullable on the wire, so an empty
    // response degrades to "no posts to analyse" rather than crashing.
    suspend fun getOwnPostStats(): Result<UserPostStats> = runCatching {
        val response = ApiClient.usersApi.getOwnPostStats()
        UserPostStats(
            posts = response.posts ?: emptyList(),
            totals = response.totalStats ?: PostStatsTotals(0, 0, 0, 0),
        )
    }

    suspend fun toggleFollow(username: String): Result<FollowToggleResponse> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }

    suspend fun toggleRepost(postId: String): Result<RepostResponse> = runCatching {
        ApiClient.postsApi.toggleRepost(postId)
    }

    suspend fun votePoll(pollId: String, optionIndex: Int): Result<PollVoteResponse> = runCatching {
        ApiClient.postsApi.votePoll(pollId, PollVoteRequest(optionIndex))
    }

    suspend fun toggleBookmark(postId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.postsApi.toggleBookmark(postId)
    }

    suspend fun deletePost(postId: String): Result<Unit> = runCatching {
        ApiClient.postsApi.deletePost(postId)
    }

    suspend fun reportPost(postId: String, reason: String, details: String?): Result<Unit> {
        return try {
            ApiClient.reportsApi.createReport(CreateReportRequest(postId = postId, reason = reason, details = details))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't submit this report. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun toggleBlock(username: String): Result<BlockToggleResponse> = runCatching {
        ApiClient.usersApi.toggleBlock(username)
    }

    suspend fun getMuteStatus(userId: String): Result<Boolean> = runCatching {
        ApiClient.usersApi.getMuteStatus(userId).muted
    }

    suspend fun toggleMute(userId: String): Result<Boolean> = runCatching {
        ApiClient.usersApi.toggleMute(MuteToggleRequest(userId)).muted
    }

    suspend fun getBlockedUsers(): Result<List<BlockedUser>> = runCatching {
        ApiClient.usersApi.getBlockedUsers()
    }

    suspend fun getMutedUsers(): Result<List<MutedUser>> = runCatching {
        ApiClient.usersApi.getMutedUsers()
    }

    suspend fun updatePost(postId: String, content: String): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.updatePost(postId, UpdatePostRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getPost(postId: String): Result<Post> = runCatching {
        ApiClient.postsApi.getPost(postId)
    }

    suspend fun togglePin(postId: String): Result<PinToggleResponse> = runCatching {
        ApiClient.postsApi.togglePin(postId)
    }

    // Matches the real, live avatar/banner upload the website's own
    // profile page performs from its camera-overlay buttons: a plain
    // multipart POST straight to our backend (see SettingsApi's KDoc
    // for why this doesn't go through the presigned UploadThing flow).
    suspend fun updateAvatar(contentResolver: ContentResolver, uri: Uri): Result<String?> = runCatching {
        val part = buildFileMultipart(contentResolver, uri)
        ApiClient.settingsApi.updateAvatar(part).avatarUrl
    }

    suspend fun updateCover(contentResolver: ContentResolver, uri: Uri): Result<String?> = runCatching {
        val part = buildFileMultipart(contentResolver, uri)
        ApiClient.settingsApi.updateCover(part).coverUrl
    }
}
