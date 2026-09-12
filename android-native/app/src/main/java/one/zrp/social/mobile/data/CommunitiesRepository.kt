package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CommunityDetailResponse
import one.zrp.social.mobile.network.CommunityMembershipResponse
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.CreateCommunityRequest
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.PollVoteRequest
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

class CommunitiesRepository {
    suspend fun getCommunities(category: String?, search: String?): Result<List<CommunitySummary>> {
        return try {
            Result.success(ApiClient.communitiesApi.getCommunities(category, search, null).items)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load communities. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getCommunity(id: String): Result<CommunityDetailResponse> {
        return try {
            Result.success(ApiClient.communitiesApi.getCommunity(id))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this community."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun createCommunity(
        name: String,
        description: String,
        category: String,
        hashtag: String,
    ): Result<CommunitySummary> {
        return try {
            val response = ApiClient.communitiesApi.createCommunity(
                CreateCommunityRequest(name = name, description = description, category = category, hashtag = hashtag),
            )
            Result.success(response.community)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't create this community."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun joinCommunity(id: String): Result<CommunityMembershipResponse> {
        return try {
            Result.success(ApiClient.communitiesApi.joinCommunity(id))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't join this community."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun leaveCommunity(id: String): Result<CommunityMembershipResponse> {
        return try {
            Result.success(ApiClient.communitiesApi.leaveCommunity(id))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't leave this community."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getCommunityFeed(id: String, cursor: String?): Result<PostsPage> {
        return try {
            Result.success(ApiClient.communitiesApi.getCommunityFeed(id, cursor))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this community's posts."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun toggleLike(postId: String) = runCatching { ApiClient.postsApi.toggleLike(postId) }
    suspend fun toggleRepost(postId: String) = runCatching { ApiClient.postsApi.toggleRepost(postId) }
    suspend fun toggleBookmark(postId: String) = runCatching { ApiClient.postsApi.toggleBookmark(postId) }
    suspend fun votePoll(pollId: String, optionIndex: Int) =
        runCatching { ApiClient.postsApi.votePoll(pollId, PollVoteRequest(optionIndex)) }

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
}
