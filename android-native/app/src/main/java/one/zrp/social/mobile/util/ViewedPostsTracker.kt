package one.zrp.social.mobile.util

/**
 * The native equivalent of PostCard.tsx's own sessionStorage-backed
 * "zrp_viewed_posts" list: the real POST /posts/{id}/view route has no
 * server-side dedup at all (see PostsApi.recordView's own KDoc), so
 * without this, re-rendering the same post - scrolling past it twice,
 * navigating back to a screen that still holds it - would count a
 * fresh view every single time. Scoped to this process's lifetime
 * (the closest real native analogue to a browser tab's session -
 * both end the same way, and neither survives the other closing),
 * capped at the same 500 entries web's own `.slice(-500)` keeps.
 */
object ViewedPostsTracker {
    private const val MAX_TRACKED = 500
    private val viewed = LinkedHashSet<String>()

    /**
     * Reserves this post as viewed and returns true the first time -
     * matching PostCard.tsx's own `if (viewed.includes(post.id)) return`
     * guard, marked BEFORE the network call resolves (fire-and-forget,
     * no retry on failure) rather than after.
     */
    @Synchronized
    fun markViewed(postId: String): Boolean {
        if (!viewed.add(postId)) return false
        if (viewed.size > MAX_TRACKED) {
            val oldest = viewed.iterator()
            oldest.next()
            oldest.remove()
        }
        return true
    }
}
