package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkItem
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.BookmarkedComment
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PollVoteRequest
import one.zrp.social.mobile.network.PollVoteResponse
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.UpdatePostRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/** One row of the merged saved-posts/saved-comments timeline GET /bookmarks returns. */
sealed class BookmarkRow {
    data class PostRow(val post: Post) : BookmarkRow()
    data class CommentRow(val comment: BookmarkedComment) : BookmarkRow()
}

data class BookmarksPageUi(val rows: List<BookmarkRow>, val nextCursor: String?)

/**
 * Maps GET /bookmarks' raw `type`-discriminated union into typed rows,
 * preserving the server's own interleaved order - a malformed item
 * (the discriminant type without its matching payload, or an
 * unrecognized type) is dropped rather than crashing the screen, since
 * this is untrusted-shape JSON off the wire.
 */
internal fun mapBookmarkItemsToRows(items: List<BookmarkItem>): List<BookmarkRow> {
    return items.mapNotNull { item ->
        when (item.type) {
            "post" -> item.post?.let { post -> BookmarkRow.PostRow(post.copy(bookmarked = true)) }
            "comment" -> item.comment?.let { BookmarkRow.CommentRow(it) }
            else -> null
        }
    }
}

/**
 * The website's Bookmarks page (src/app/bookmarks/page.tsx) shows both
 * saved posts and saved comments in one merged list, in the server's
 * own interleaved (createdAt DESC) order - reproduced here rather than
 * splitting into two separately-paginated lists.
 * GET /bookmarks doesn't mark each post's own `bookmarked` flag (only
 * `liked` gets that treatment server-side) even though every post
 * here is definitionally bookmarked, so that's corrected here rather
 * than passed through as a misleading null.
 */
class BookmarksRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getBookmarks(cursor: String?): Result<BookmarksPageUi> = runCatching {
        val page = ApiClient.bookmarksApi.getBookmarks(cursor)
        BookmarksPageUi(rows = mapBookmarkItemsToRows(page.items), nextCursor = page.nextCursor)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }

    suspend fun votePoll(pollId: String, optionIndex: Int): Result<PollVoteResponse> = runCatching {
        ApiClient.postsApi.votePoll(pollId, PollVoteRequest(optionIndex))
    }

    suspend fun toggleRepost(postId: String): Result<RepostResponse> = runCatching {
        ApiClient.postsApi.toggleRepost(postId)
    }

    suspend fun toggleBookmark(postId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.postsApi.toggleBookmark(postId)
    }

    suspend fun toggleCommentBookmark(commentId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.commentsApi.toggleBookmark(commentId)
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
            Result.failure(Exception(ZrpErrors.NETWORK))
        }
    }

    suspend fun updatePost(postId: String, content: String): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.updatePost(postId, UpdatePostRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception(ZrpErrors.NETWORK))
        }
    }
}
