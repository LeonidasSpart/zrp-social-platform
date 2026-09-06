package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * The website's Bookmarks page (src/app/bookmarks/page.tsx) shows both
 * saved posts and saved comments in one merged list; this screen only
 * has a real comment-viewing surface reached through a comment's
 * parent post, not a standalone comment view, so it shows the saved
 * posts (the overwhelming common case) and leaves saved comments for a
 * later, dedicated pass rather than inventing a bare-comment screen.
 * GET /bookmarks doesn't mark each post's own `bookmarked` flag (only
 * `liked` gets that treatment server-side) even though every post
 * here is definitionally bookmarked, so that's corrected here rather
 * than passed through as a misleading null.
 */
class BookmarksRepository {
    suspend fun getBookmarkedPosts(cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.bookmarksApi.getBookmarks(cursor)
        val posts = page.items
            .filter { it.type == "post" }
            .mapNotNull { it.post }
            .map { post: Post -> post.copy(bookmarked = true) }
        PostsPage(posts = posts, nextCursor = page.nextCursor)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }

    suspend fun toggleRepost(postId: String): Result<RepostResponse> = runCatching {
        ApiClient.postsApi.toggleRepost(postId)
    }

    suspend fun toggleBookmark(postId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.postsApi.toggleBookmark(postId)
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
}
