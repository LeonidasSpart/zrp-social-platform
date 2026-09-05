package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateStoryRequest
import one.zrp.social.mobile.network.StoryLikeResponse
import one.zrp.social.mobile.network.UserStories

class StoriesRepository {
    suspend fun getOwnUserId(): Result<String> = runCatching {
        val session = ApiClient.authApi.getSession()
        session.user?.id ?: throw IllegalStateException("Not signed in")
    }

    suspend fun getStories(): Result<List<UserStories>> = runCatching {
        ApiClient.storiesApi.getStories()
    }

    suspend fun createStory(content: String): Result<Unit> = runCatching {
        ApiClient.storiesApi.createStory(CreateStoryRequest(content))
        Unit
    }

    suspend fun markViewed(storyId: String): Result<Unit> = runCatching {
        ApiClient.storiesApi.markViewed(storyId)
    }

    suspend fun toggleLike(storyId: String): Result<StoryLikeResponse> = runCatching {
        ApiClient.storiesApi.toggleLike(storyId)
    }
}
