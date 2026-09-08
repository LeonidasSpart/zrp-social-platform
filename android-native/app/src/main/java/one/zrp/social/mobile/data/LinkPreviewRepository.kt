package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LinkPreview

/**
 * Wraps GET /api/link-preview - the same on-demand, render-time unfurl
 * LinkPreviewCard.tsx itself calls (see its own useEffect(fetch...)).
 * Deliberately not routed through PostsRepository/SearchRepository/etc:
 * unlike toggleLike/votePoll, a fetched preview never mutates any
 * screen's post list state, it's purely local to the one PostCard
 * rendering it - so every PostCard instance, regardless of which
 * screen's ViewModel owns the underlying post, shares this same
 * stateless repository instead of a per-screen wrapper being added
 * four more times.
 */
class LinkPreviewRepository {
    suspend fun getLinkPreview(url: String): Result<LinkPreview> = runCatching {
        ApiClient.postsApi.getLinkPreview(url)
    }
}
