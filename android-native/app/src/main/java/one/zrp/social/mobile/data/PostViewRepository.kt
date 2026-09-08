package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.PostViewResponse

/**
 * Wraps POST /api/posts/{id}/view - like [LinkPreviewRepository], never
 * mutates any screen's post list state (the real count it returns just
 * updates the one PostCard that fired it, same as the website's own
 * local setViewsCount), so every PostCard shares this one stateless
 * repository rather than a per-screen wrapper being added five more
 * times.
 */
class PostViewRepository {
    suspend fun recordView(postId: String): Result<PostViewResponse> = runCatching {
        ApiClient.postsApi.recordView(postId)
    }
}
