package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class CommunitySummary(
    val id: String,
    val slug: String,
    val name: String,
    val description: String,
    val category: String,
    val hashtag: String,
    val iconUrl: String?,
    val memberCount: Int,
    val isMember: Boolean = false,
    val myRole: String? = null,
)

data class CommunitiesPage(
    val items: List<CommunitySummary>,
    val nextCursor: String?,
    val categories: List<String> = emptyList(),
)

data class CommunityDetailResponse(
    val community: CommunitySummary,
    val isMember: Boolean,
    val myRole: String?,
)

data class CreateCommunityRequest(
    val name: String,
    val description: String,
    val category: String,
    val hashtag: String,
)

data class CreateCommunityResponse(
    val community: CommunitySummary,
    val isMember: Boolean,
    val myRole: String?,
)

data class CommunityMembershipResponse(
    val isMember: Boolean,
    val alreadyMember: Boolean = false,
)

/**
 * Real, database-backed communities - see prisma/schema.prisma's
 * Community/CommunityMember models. Replaces the earlier trending-
 * hashtag reskin (CommunitiesScreen's original KDoc explained why that
 * was the honest choice at the time: no membership feature existed
 * anywhere in ZRP). A community's feed is still hashtag-derived
 * (GET .../feed), reusing PostsPage/Post from PostsApi.kt rather than a
 * parallel post model, since the JSON shape the server returns is
 * identical field-for-field.
 */
interface CommunitiesApi {
    @GET("communities")
    suspend fun getCommunities(
        @Query("category") category: String?,
        @Query("search") search: String?,
        @Query("cursor") cursor: String?,
    ): CommunitiesPage

    @POST("communities")
    suspend fun createCommunity(@Body request: CreateCommunityRequest): CreateCommunityResponse

    @GET("communities/{id}")
    suspend fun getCommunity(@Path("id") id: String): CommunityDetailResponse

    @POST("communities/{id}/join")
    suspend fun joinCommunity(@Path("id") id: String): CommunityMembershipResponse

    @POST("communities/{id}/leave")
    suspend fun leaveCommunity(@Path("id") id: String): CommunityMembershipResponse

    @GET("communities/{id}/feed")
    suspend fun getCommunityFeed(@Path("id") id: String, @Query("cursor") cursor: String?): PostsPage
}
