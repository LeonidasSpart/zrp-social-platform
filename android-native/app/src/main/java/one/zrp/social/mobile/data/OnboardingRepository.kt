package one.zrp.social.mobile.data

import android.content.ContentResolver
import android.net.Uri
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.OnboardingProfileRequest
import one.zrp.social.mobile.network.SuggestedUser
import one.zrp.social.mobile.network.buildFileMultipart
import one.zrp.social.mobile.network.zrpErrorCode
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Two of this screen's three real mutations (profile completion,
 * marking onboarding done) can 401 with ACCOUNT_NOT_FOUND for a signed
 * session whose underlying User row is gone - src/app/onboarding/
 * page.tsx's own recoverFromMissingAccount() handles that by signing
 * out and sending the person to a real re-authentication rather than
 * leaving them stuck on a form that can never succeed. [AccountMissing]
 * lets OnboardingViewModel do the native equivalent (AuthViewModel.
 * logoutWithSessionExpired()).
 */
sealed interface OnboardingSaveResult {
    data object Success : OnboardingSaveResult
    data object AccountMissing : OnboardingSaveResult

    // serverMessage is the real, specific message the route itself
    // returned (e.g. a validation error) when there was one; null on a
    // true network-level failure (no HTTP response to read at all) -
    // OnboardingViewModel picks the right translated generic fallback
    // for whichever action failed in that case, the same way
    // page.tsx's own `error.message || t("onboarding.err...")` does.
    data class Failure(val serverMessage: String?) : OnboardingSaveResult
}

/**
 * The same real endpoints src/app/onboarding/page.tsx itself calls:
 * profile completion (PUT /user/profile - a distinct route from
 * Settings' own profile edit, see OnboardingApi's KDoc), avatar upload
 * (the same shared update-avatar route ProfileRepository already
 * wraps), suggested follows, the shared follow toggle, and marking
 * onboarding complete.
 */
class OnboardingRepository {
    suspend fun updateProfile(name: String, bio: String, location: String, website: String): OnboardingSaveResult =
        runProtected {
            ApiClient.onboardingApi.updateProfile(
                OnboardingProfileRequest(name.trim(), bio.trim(), location.trim(), website.trim()),
            )
        }

    suspend fun uploadAvatar(contentResolver: ContentResolver, uri: Uri): Result<String?> = runCatching {
        ApiClient.settingsApi.updateAvatar(buildFileMultipart(contentResolver, uri)).avatarUrl
    }

    suspend fun getSuggestedUsers(): Result<List<SuggestedUser>> = runCatching {
        ApiClient.onboardingApi.getSuggestedUsers()
    }

    // The real route ignores the request body entirely and just toggles
    // - safe to call as a plain "follow" here since /users/suggested
    // only ever returns people the caller isn't already following.
    suspend fun followUser(username: String): Result<Unit> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
        Unit
    }

    suspend fun completeOnboarding(): OnboardingSaveResult = runProtected {
        ApiClient.onboardingApi.completeOnboarding()
    }

    private suspend fun runProtected(block: suspend () -> Any?): OnboardingSaveResult {
        return try {
            block()
            OnboardingSaveResult.Success
        } catch (e: HttpException) {
            if (e.zrpErrorCode() == "ACCOUNT_NOT_FOUND") {
                OnboardingSaveResult.AccountMissing
            } else {
                OnboardingSaveResult.Failure(e.zrpErrorMessage())
            }
        } catch (e: Exception) {
            OnboardingSaveResult.Failure(serverMessage = null)
        }
    }
}
