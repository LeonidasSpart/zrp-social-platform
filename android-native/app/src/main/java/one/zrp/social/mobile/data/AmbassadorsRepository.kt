package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AdminAmbassadorsResponse
import one.zrp.social.mobile.network.AmbassadorActionRequest
import one.zrp.social.mobile.network.AmbassadorActionResponse
import one.zrp.social.mobile.network.AmbassadorApplyRequest
import one.zrp.social.mobile.network.AmbassadorCountriesResponse
import one.zrp.social.mobile.network.AmbassadorProfile
import one.zrp.social.mobile.network.AmbassadorStatsResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/** ZRP Global Ambassadors - see AmbassadorsApi's own KDoc for the full real contract. */
class AmbassadorsRepository {
    // Same per-app language resolution LegalRepository already uses for
    // GET /api/legal/{page}?lang= - reused rather than duplicated here.
    suspend fun getCountries(): Result<AmbassadorCountriesResponse> = runCatching {
        ApiClient.ambassadorsApi.getCountries(LegalRepository.currentLanguageCode())
    }

    suspend fun getStats(): Result<AmbassadorStatsResponse> = runCatching {
        ApiClient.ambassadorsApi.getStats()
    }

    suspend fun getMyProfile(): Result<AmbassadorProfile?> = runCatching {
        ApiClient.ambassadorsApi.getMyProfile().profile
    }

    suspend fun apply(
        countryCode: String,
        cityRegion: String?,
        languages: List<String>,
        communityLinks: List<String>,
        motivation: String,
        communityDescription: String?,
        audienceSize: Int?,
    ): Result<AmbassadorProfile> {
        return try {
            val request = AmbassadorApplyRequest(
                countryCode = countryCode,
                cityRegion = cityRegion,
                languages = languages,
                communityLinks = communityLinks,
                motivation = motivation,
                communityDescription = communityDescription,
                audienceSize = audienceSize,
            )
            val response = ApiClient.ambassadorsApi.apply(request)
            val profile = response.profile
            if (response.success && profile != null) {
                Result.success(profile)
            } else {
                Result.failure(Exception(response.error ?: "Couldn't submit your application."))
            }
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't submit your application."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getAdminProfiles(
        status: String?,
        search: String?,
        page: Int,
        limit: Int,
    ): Result<AdminAmbassadorsResponse> = runCatching {
        ApiClient.ambassadorsApi.getAdminProfiles(
            status = status?.takeIf { it.isNotEmpty() },
            search = search?.takeIf { it.isNotEmpty() },
            page = page,
            limit = limit,
        )
    }

    suspend fun reviewAmbassador(userId: String, action: String, reason: String?): Result<AmbassadorActionResponse> {
        return try {
            val request = AmbassadorActionRequest(action = action, reason = reason)
            val response = ApiClient.ambassadorsApi.updateAmbassadorStatus(userId, request)
            if (response.success) Result.success(response) else Result.failure(Exception(response.error ?: "Action failed."))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Action failed."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
