package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class ListSummary(
    val id: String,
    val name: String,
    val description: String?,
    val isPrivate: Boolean,
    val memberCount: Int,
)

data class ListsPage(
    val items: List<ListSummary>,
    val nextCursor: String?,
)

data class ListMemberUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

data class ListMemberEntry(
    val addedAt: String,
    val user: ListMemberUser,
)

data class ListDetail(
    val id: String,
    val name: String,
    val description: String?,
    val isPrivate: Boolean,
    val ownerId: String,
    val owner: ListMemberUser,
    val members: List<ListMemberEntry>,
    val memberCount: Int,
)

data class ListDetailResponse(val list: ListDetail, val isOwner: Boolean)

data class CreateListRequest(val name: String, val description: String?, val isPrivate: Boolean)
data class CreateListResponse(val list: ListSummary)

data class UpdateListRequest(val name: String? = null, val description: String? = null, val isPrivate: Boolean? = null)
data class UpdateListResult(val list: ListSummary)

data class AddListMemberRequest(val username: String)
data class AddListMemberResponse(val added: Boolean, val alreadyMember: Boolean, val user: ListMemberUser)

/**
 * Twitter/X-style curated lists - see prisma/schema.prisma's List/
 * ListMember models. A list's feed is member-derived, same pattern as
 * CommunitiesApi's hashtag-derived feed: reuses PostsPage/Post from
 * PostsApi.kt since the server returns an identical JSON shape.
 */
interface ListsApi {
    @GET("lists")
    suspend fun getMyLists(@Query("cursor") cursor: String?): ListsPage

    @POST("lists")
    suspend fun createList(@Body request: CreateListRequest): CreateListResponse

    @GET("lists/{id}")
    suspend fun getList(@Path("id") id: String): ListDetailResponse

    @PATCH("lists/{id}")
    suspend fun updateList(@Path("id") id: String, @Body request: UpdateListRequest): UpdateListResult

    @DELETE("lists/{id}")
    suspend fun deleteList(@Path("id") id: String)

    @POST("lists/{id}/members")
    suspend fun addMember(@Path("id") id: String, @Body request: AddListMemberRequest): AddListMemberResponse

    @DELETE("lists/{id}/members/{userId}")
    suspend fun removeMember(@Path("id") id: String, @Path("userId") userId: String)

    @GET("lists/{id}/feed")
    suspend fun getListFeed(@Path("id") id: String, @Query("cursor") cursor: String?): PostsPage
}
