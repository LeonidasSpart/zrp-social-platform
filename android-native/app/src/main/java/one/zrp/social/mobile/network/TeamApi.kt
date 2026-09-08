package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

data class TeamUser(
    val id: String,
    val username: String,
    val name: String?,
    val email: String,
    val avatarUrl: String?,
    val plan: String,
)

data class TeamMember(
    val id: String,
    val accountId: String,
    val userId: String,
    // "ADMIN" | "EDITOR" | "VIEWER" - the real Prisma enum values.
    val role: String,
    val createdAt: String,
    val user: TeamUser,
)

// Mirrors TeamOwner on the website exactly: the account holder isn't a
// real TeamMember row (there's nothing to invite - they own the
// account), so GET /api/team synthesizes this from the user's own
// fields plus a hardcoded role: "OWNER".
data class TeamOwner(
    val id: String,
    val username: String,
    val name: String?,
    val email: String,
    val avatarUrl: String?,
    val plan: String,
    val role: String = "OWNER",
)

data class TeamResponse(val members: List<TeamMember>, val owner: TeamOwner?)

data class AddTeamMemberRequest(val email: String, val role: String)

data class UpdateTeamMemberRoleRequest(val role: String)

data class TeamMemberResponse(val member: TeamMember)

/**
 * The real Team Management feature (src/app/settings/team/page.tsx +
 * src/app/api/team/route.ts + src/app/api/team/[memberId]/route.ts) -
 * Business/Enterprise-plan account owners invite other existing ZRP
 * users by email onto their account with a role, and manage that
 * roster. GET 403s with a plain error message for an ineligible plan
 * (canManageTeam() server-side) - TeamRepository turns that into a
 * dedicated "not eligible" outcome rather than a generic load error.
 */
interface TeamApi {
    @GET("team")
    suspend fun getTeam(): TeamResponse

    @POST("team")
    suspend fun addMember(@Body request: AddTeamMemberRequest): TeamMemberResponse

    @PATCH("team/{memberId}")
    suspend fun updateMemberRole(@Path("memberId") memberId: String, @Body request: UpdateTeamMemberRoleRequest): TeamMemberResponse

    @DELETE("team/{memberId}")
    suspend fun removeMember(@Path("memberId") memberId: String)
}
