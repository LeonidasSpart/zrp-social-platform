package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.network.CommentsPage
import one.zrp.social.mobile.network.CreateCommentRequest
import one.zrp.social.mobile.network.CreateReportRequest
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

    // Backend paginates top-level threads 10 at a time (each thread's own
    // replies come back in full, unpaginated, on that same page - see
    // src/app/api/posts/[id]/comments/route.ts). Returning the raw
    // CommentsPage (not just its comments list, as this used to) is what
    // lets the ViewModel actually request page 2+ via nextCursor instead
    // of silently truncating any post with more than 10 top-level
    // comments - the real bug this fixes.
    suspend fun getComments(postId: String, cursor: String? = null): Result<CommentsPage> = runCatching {
        ApiClient.commentsApi.getComments(postId, cursor)
    }

    suspend fun createComment(postId: String, content: String, parentId: String? = null): Result<Comment> {
        return try {
            Result.success(ApiClient.commentsApi.createComment(postId, CreateCommentRequest(content, parentId)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't post this comment. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception(ZrpErrors.NETWORK))
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
            Result.failure(Exception(ZrpErrors.NETWORK))
        }
    }

    suspend fun deleteComment(commentId: String): Result<Unit> = runCatching {
        ApiClient.commentsApi.deleteComment(commentId)
    }

    // Same generic POST /api/reports the website's Comments.tsx already
    // uses for a comment (commentId, not postId) - the moderation queue
    // treats it identically to any other report target.
    suspend fun reportComment(commentId: String, reason: String, details: String?): Result<Unit> = runCatching {
        ApiClient.reportsApi.createReport(CreateReportRequest(commentId = commentId, reason = reason, details = details))
    }
}
