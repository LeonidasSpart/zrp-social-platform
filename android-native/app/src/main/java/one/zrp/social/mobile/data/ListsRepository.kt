package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AddListMemberRequest
import one.zrp.social.mobile.network.AddListMemberResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateListRequest
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.ListDetailResponse
import one.zrp.social.mobile.network.ListSummary
import one.zrp.social.mobile.network.PollVoteRequest
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

class ListsRepository {
    suspend fun getMyLists(): Result<List<ListSummary>> {
        return try {
            Result.success(ApiClient.listsApi.getMyLists(null).items)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load your lists."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun createList(name: String, description: String?, isPrivate: Boolean): Result<ListSummary> {
        return try {
            Result.success(ApiClient.listsApi.createList(CreateListRequest(name, description, isPrivate)).list)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't create this list."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getList(id: String): Result<ListDetailResponse> {
        return try {
            Result.success(ApiClient.listsApi.getList(id))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this list."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteList(id: String): Result<Unit> {
        return try {
            ApiClient.listsApi.deleteList(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't delete this list."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun addMember(id: String, username: String): Result<AddListMemberResponse> {
        return try {
            Result.success(ApiClient.listsApi.addMember(id, AddListMemberRequest(username)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't add this member."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun removeMember(id: String, userId: String): Result<Unit> {
        return try {
            ApiClient.listsApi.removeMember(id, userId)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't remove this member."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getListFeed(id: String, cursor: String?): Result<PostsPage> {
        return try {
            Result.success(ApiClient.listsApi.getListFeed(id, cursor))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this list's posts."))
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
