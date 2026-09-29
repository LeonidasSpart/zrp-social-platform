package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BlockToggleResponse
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.DiscoverEventRequest
import one.zrp.social.mobile.network.DiscoverEventType
import one.zrp.social.mobile.network.DiscoverNotInterestedRequest
import one.zrp.social.mobile.network.DiscoverPage
import one.zrp.social.mobile.network.FollowToggleResponse
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.NearbyPeoplePage
import one.zrp.social.mobile.network.MuteToggleRequest
import one.zrp.social.mobile.network.MuteToggleResponse
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP Discover - ported from src/app/discover/page.tsx: the server-
 * ranked vertical video feed (GET /api/discover) plus its own watch-
 * event/"not interested" endpoints. Like/repost/save/follow/report/
 * mute/block all reuse the exact same real endpoints every other
 * screen's own repository already wraps (PostsApi/UsersApi/ReportsApi) -
 * duplicated here rather than shared, per this codebase's established
 * per-screen repository convention.
 */
class DiscoverRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getFeed(cursor: String?): Result<DiscoverPage> = runCatching {
        ApiClient.discoverApi.getFeed(cursor)
    }

    // "People near you" (country-based, never GPS - see NearbyUser's own
    // KDoc). Requires an authenticated session; the server itself returns
    // an honest empty result rather than a 401 for a signed-in viewer
    // with no known country, so this only fails on a real network/auth
    // error.
    suspend fun getNearbyPeople(limit: Int = 20): Result<NearbyPeoplePage> = runCatching {
        ApiClient.discoverApi.getNearbyPeople(limit = limit)
    }

    // Watch-event/not-interested failures must never surface to the
    // viewer or interrupt playback - matches sendEvent's own
    // `.catch(() => {})` on web (analytics is never allowed to break
    // the feed) and handleNotInterested's own best-effort network call.
    suspend fun recordEvent(postId: String, eventType: DiscoverEventType, watchedMs: Int? = null) {
        runCatching { ApiClient.discoverApi.recordEvent(DiscoverEventRequest(postId, eventType, watchedMs)) }
    }

    suspend fun markNotInterested(postId: String): Result<Unit> = runCatching {
        ApiClient.discoverApi.markNotInterested(DiscoverNotInterestedRequest(postId))
        Unit
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }

    suspend fun toggleRepost(postId: String): Result<RepostResponse> = runCatching {
        ApiClient.postsApi.toggleRepost(postId)
    }

    suspend fun toggleSave(postId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.postsApi.toggleBookmark(postId)
    }

    suspend fun toggleFollow(username: String): Result<FollowToggleResponse> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
    }

    suspend fun toggleMute(userId: String): Result<MuteToggleResponse> = runCatching {
        ApiClient.usersApi.toggleMute(MuteToggleRequest(userId))
    }

    suspend fun toggleBlock(username: String): Result<BlockToggleResponse> = runCatching {
        ApiClient.usersApi.toggleBlock(username)
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
}
