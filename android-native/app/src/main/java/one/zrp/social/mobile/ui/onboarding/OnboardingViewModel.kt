package one.zrp.social.mobile.ui.onboarding

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.OnboardingRepository
import one.zrp.social.mobile.data.OnboardingSaveResult
import one.zrp.social.mobile.network.SuggestedUser

// A real, specific server message (validation error, etc.) is shown
// as-is via Server; the other cases are true network-level failures
// with no server message to show, so OnboardingScreen resolves each to
// the matching translated generic fallback (mirroring page.tsx's own
// `error.message || t("onboarding.err...")` per action).
sealed interface OnboardingError {
    data class Server(val message: String) : OnboardingError
    data object SaveProfileFailed : OnboardingError
    data object FollowUsersFailed : OnboardingError
    data object SkipFailed : OnboardingError
    data object AvatarUploadFailed : OnboardingError
}

data class OnboardingUiState(
    // 0 = profile, 1 = follow suggestions, 2 = done - the same three
    // steps src/app/onboarding/page.tsx itself tracks.
    val step: Int = 0,
    val name: String = "",
    val bio: String = "",
    val location: String = "",
    val website: String = "",
    val avatarUrl: String? = null,
    val isUploadingAvatar: Boolean = false,
    val suggestedUsers: List<SuggestedUser> = emptyList(),
    val following: Set<String> = emptySet(),
    val isSaving: Boolean = false,
    val error: OnboardingError? = null,
)

private fun OnboardingSaveResult.Failure.toError(fallback: OnboardingError): OnboardingError =
    serverMessage?.let { OnboardingError.Server(it) } ?: fallback

/**
 * Backs the native Onboarding screen shown right after a first login
 * whose account has onboardingCompleted == false - the same three real
 * steps and the same real endpoints src/app/onboarding/page.tsx itself
 * uses (see OnboardingRepository's own KDoc for each one). [onFinished]
 * routes back into the main app once onboarding is actually complete;
 * [onAccountMissing] is the native equivalent of the web page's own
 * recoverFromMissingAccount().
 */
class OnboardingViewModel(
    private val repository: OnboardingRepository,
    private val onAccountMissing: () -> Unit,
    private val onFinished: () -> Unit,
) : ViewModel() {
    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

    fun onNameChange(value: String) = _state.update { it.copy(name = value) }
    fun onBioChange(value: String) = _state.update { it.copy(bio = value.take(160)) }
    fun onLocationChange(value: String) = _state.update { it.copy(location = value) }
    fun onWebsiteChange(value: String) = _state.update { it.copy(website = value) }

    fun uploadAvatar(contentResolver: ContentResolver, uri: Uri) {
        if (_state.value.isUploadingAvatar) return
        _state.update { it.copy(isUploadingAvatar = true, error = null) }
        viewModelScope.launch {
            repository.uploadAvatar(contentResolver, uri)
                .onSuccess { url ->
                    _state.update { it.copy(isUploadingAvatar = false, avatarUrl = url ?: it.avatarUrl) }
                }
                .onFailure {
                    _state.update { it.copy(isUploadingAvatar = false, error = OnboardingError.AvatarUploadFailed) }
                }
        }
    }

    fun toggleFollow(userId: String) {
        _state.update {
            val next = it.following.toMutableSet()
            if (!next.add(userId)) next.remove(userId)
            it.copy(following = next)
        }
    }

    // Step 0's "Continue" - saves the profile, then loads suggestions
    // for step 1, matching handleNext()'s own step === 0 branch.
    fun onContinueFromProfile() {
        if (_state.value.isSaving) return
        val current = _state.value
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            when (val result = repository.updateProfile(current.name, current.bio, current.location, current.website)) {
                OnboardingSaveResult.Success -> {
                    _state.update { it.copy(isSaving = false, step = 1) }
                    loadSuggestedUsers()
                }
                OnboardingSaveResult.AccountMissing -> onAccountMissing()
                is OnboardingSaveResult.Failure -> _state.update {
                    it.copy(isSaving = false, error = result.toError(OnboardingError.SaveProfileFailed))
                }
            }
        }
    }

    private fun loadSuggestedUsers() {
        viewModelScope.launch {
            repository.getSuggestedUsers().onSuccess { users ->
                _state.update { it.copy(suggestedUsers = users) }
            }
        }
    }

    // Step 1's "Finish" - follows every selected suggestion, then
    // marks onboarding complete, matching handleNext()'s own step === 1
    // branch. Unlike that branch (which redirects home immediately -
    // its own step === 2 UI is unreachable dead code, since it never
    // calls setStep(2) before the redirect), this advances to step 2 so
    // the real "You're all set" copy it never gets to show is actually
    // shown before returning to the main app.
    fun onFinishFollowing() {
        if (_state.value.isSaving) return
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            val current = _state.value
            val selected = current.suggestedUsers.filter { current.following.contains(it.id) }
            for (user in selected) {
                if (repository.followUser(user.username).isFailure) {
                    _state.update { it.copy(isSaving = false, error = OnboardingError.FollowUsersFailed) }
                    return@launch
                }
            }
            when (val result = repository.completeOnboarding()) {
                OnboardingSaveResult.Success -> _state.update { it.copy(isSaving = false, step = 2) }
                OnboardingSaveResult.AccountMissing -> onAccountMissing()
                is OnboardingSaveResult.Failure -> _state.update {
                    it.copy(isSaving = false, error = result.toError(OnboardingError.FollowUsersFailed))
                }
            }
        }
    }

    fun onSkip() {
        if (_state.value.isSaving) return
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            when (val result = repository.completeOnboarding()) {
                OnboardingSaveResult.Success -> onFinished()
                OnboardingSaveResult.AccountMissing -> onAccountMissing()
                is OnboardingSaveResult.Failure -> _state.update {
                    it.copy(isSaving = false, error = result.toError(OnboardingError.SkipFailed))
                }
            }
        }
    }

    fun onGoToHome() = onFinished()
}

class OnboardingViewModelFactory(
    private val repository: OnboardingRepository,
    private val onAccountMissing: () -> Unit,
    private val onFinished: () -> Unit,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return OnboardingViewModel(repository, onAccountMissing, onFinished) as T
    }
}
