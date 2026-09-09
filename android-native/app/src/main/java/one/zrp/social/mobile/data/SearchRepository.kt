package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PollVoteRequest
import one.zrp.social.mobile.network.PollVoteResponse
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.SearchResults
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.TrendingHashtag
import one.zrp.social.mobile.network.UpdatePostRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

class SearchRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun search(query: String): Result<SearchResults> = runCatching {
        ApiClient.searchApi.search(query)
    }

    suspend fun getSuggestedUsers(limit: Int = 10): Result<List<SearchUser>> = runCatching {
        ApiClient.searchApi.getSuggestedUsers(limit)
    }

    // type="users" backs the group-chat multi-select picker (new-group
    // creation, add-participants) - the exact same real GET /search
    // already-blocked/muted-exclusion this app's people search uses
    // (see SearchApi's own KDoc), just narrowed to users only rather
    // than also searching posts.
    suspend fun searchUsers(query: String): Result<List<SearchUser>> = runCatching {
        ApiClient.searchApi.search(query, type = "users").users
    }

    suspend fun getTrendingHashtags(limit: Int = 10): Result<List<TrendingHashtag>> = runCatching {
        ApiClient.searchApi.getTrendingHashtags(limit)
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

    suspend fun updatePost(postId: String, content: String): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.updatePost(postId, UpdatePostRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
