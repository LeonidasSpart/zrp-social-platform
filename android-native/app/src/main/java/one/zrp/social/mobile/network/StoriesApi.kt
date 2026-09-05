package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class StoryAuthor(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
)

data class StoryItem(
    val id: String,
    val content: String?,
    val mediaUrl: String?,
    val mediaType: String?,
    val createdAt: String,
    val viewed: Boolean,
    val viewCount: Int,
    val liked: Boolean,
    val likeCount: Int,
)

data class UserStories(
    val user: StoryAuthor,
    val stories: List<StoryItem>,
)

data class CreateStoryRequest(val content: String)

data class CreatedStory(
    val id: String,
    val content: String?,
    val mediaUrl: String?,
    val mediaType: String?,
    val createdAt: String,
    val expiresAt: String,
)

data class StoryLikeResponse(val liked: Boolean)

/**
 * The same real 24-hour stories the website's rail uses - GET
 * /stories (grouped per author: own + everyone followed, already
 * excludes expired ones server-side), POST /stories (create -
 * text-only here; see PostsApi.createPost's note on why native media
 * upload isn't wired yet), POST /stories/{id}/view, POST
 * /stories/{id}/like.
 */
interface StoriesApi {
    @GET("stories")
    suspend fun getStories(): List<UserStories>

    @POST("stories")
    suspend fun createStory(@Body request: CreateStoryRequest): CreatedStory

    @POST("stories/{id}/view")
    suspend fun markViewed(@Path("id") storyId: String)

    @POST("stories/{id}/like")
    suspend fun toggleLike(@Path("id") storyId: String): StoryLikeResponse
}
