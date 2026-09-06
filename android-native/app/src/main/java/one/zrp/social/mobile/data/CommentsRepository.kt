package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.network.CreateCommentRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around CommentsApi for a single post's comment thread -
 * loading it and posting a new top-level comment.
 */
class CommentsRepository {
    suspend fun getComments(postId: String): Result<List<Comment>> = runCatching {
        ApiClient.commentsApi.getComments(postId, cursor = null).comments ?: emptyList()
    }

    suspend fun createComment(postId: String, content: String): Result<Comment> {
        return try {
            Result.success(ApiClient.commentsApi.createComment(postId, CreateCommentRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't post this comment. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
