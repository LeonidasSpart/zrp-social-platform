package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.network.CreateCommentRequest
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.UpdateCommentRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around CommentsApi for a single post's comment thread -
 * loading it, posting a new top-level comment or reply, and the same
 * real like/repost/bookmark/edit/delete actions the website's own
 * CommentItem exposes.
 */
class CommentsRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getComments(postId: String): Result<List<Comment>> = runCatching {
        ApiClient.commentsApi.getComments(postId, cursor = null).comments ?: emptyList()
    }

    suspend fun createComment(postId: String, content: String, parentId: String? = null): Result<Comment> {
        return try {
            Result.success(ApiClient.commentsApi.createComment(postId, CreateCommentRequest(content, parentId)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't post this comment. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun toggleLike(commentId: String): Result<LikeResponse> = runCatching {
        ApiClient.commentsApi.toggleLike(commentId)
    }

    suspend fun toggleRepost(commentId: String): Result<RepostResponse> = runCatching {
        ApiClient.commentsApi.toggleRepost(commentId)
    }

    suspend fun toggleBookmark(commentId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.commentsApi.toggleBookmark(commentId)
    }

    suspend fun updateComment(commentId: String, content: String): Result<Comment> {
        return try {
            Result.success(ApiClient.commentsApi.updateComment(commentId, UpdateCommentRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this comment. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteComment(commentId: String): Result<Unit> = runCatching {
        ApiClient.commentsApi.deleteComment(commentId)
    }
}
