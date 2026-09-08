package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AddTeamMemberRequest
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.TeamMemberResponse
import one.zrp.social.mobile.network.TeamResponse
import one.zrp.social.mobile.network.UpdateTeamMemberRoleRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/** GET /api/team's own two real outcomes: a Business/Enterprise account (the real team, however empty), or a 403 for anything else - never a client-side plan guess. */
sealed class TeamLoadOutcome {
    data class Eligible(val response: TeamResponse) : TeamLoadOutcome()
    data class Ineligible(val message: String?) : TeamLoadOutcome()
}

/**
 * Backs the real Team Management feature - see TeamApi's own KDoc.
 * Every write (add/update role/remove) reuses the server's own
 * descriptive error text (already covers "you need Business/Enterprise",
 * "only the owner or an admin can do this", "already a member", etc.)
 * rather than re-deriving those rules client-side.
 */
class TeamRepository {
    suspend fun getTeam(): Result<TeamLoadOutcome> {
        return try {
            Result.success(TeamLoadOutcome.Eligible(ApiClient.teamApi.getTeam()))
        } catch (e: HttpException) {
            if (e.code() == 403) {
                Result.success(TeamLoadOutcome.Ineligible(e.zrpErrorMessage()))
            } else {
                Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load your team."))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun addMember(email: String, role: String): Result<TeamMemberResponse> =
        safeCall("Failed to add member.") {
            ApiClient.teamApi.addMember(AddTeamMemberRequest(email, role))
        }

    suspend fun updateMemberRole(memberId: String, role: String): Result<TeamMemberResponse> =
        safeCall("Failed to update role.") {
            ApiClient.teamApi.updateMemberRole(memberId, UpdateTeamMemberRoleRequest(role))
        }

    suspend fun removeMember(memberId: String): Result<Unit> =
        safeCall("Failed to remove member.") {
            ApiClient.teamApi.removeMember(memberId)
        }

    private suspend fun <T> safeCall(genericError: String, block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: genericError))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
