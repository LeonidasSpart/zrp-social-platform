package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository

data class PrivacySettingsUiState(
    val isLoading: Boolean = true,
    val publicLikes: Boolean = true,
    val publicFollowing: Boolean = true,
    val isPrivate: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
)

/** The Privacy & Safety category's toggles (PUT /api/user/privacy). */
class PrivacySettingsViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(PrivacySettingsUiState())
    val state: StateFlow<PrivacySettingsUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val username = repository.getOwnUsername().getOrElse {
                _state.update { state -> state.copy(isLoading = false, error = it.message) }
                return@launch
            }
            repository.getProfile(username)
                .onSuccess { profile ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            publicLikes = profile.publicLikes,
                            publicFollowing = profile.publicFollowing,
                            isPrivate = profile.isPrivate,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    // Each toggle saves immediately (matching the website's own submit
    // form, just one field at a time instead of batched) with an
    // optimistic flip and revert-on-failure, the same pattern already
    // used for Stories' like toggle and post reactions.
    fun setPublicLikes(value: Boolean) = save(_state.value.copy(publicLikes = value))
    fun setPublicFollowing(value: Boolean) = save(_state.value.copy(publicFollowing = value))
    fun setPrivate(value: Boolean) = save(_state.value.copy(isPrivate = value))

    private fun save(next: PrivacySettingsUiState) {
        val previous = _state.value
        _state.update { next.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            repository.updatePrivacy(next.publicLikes, next.publicFollowing, next.isPrivate)
                .onSuccess { _state.update { it.copy(isSaving = false) } }
                .onFailure { error -> _state.update { previous.copy(isSaving = false, error = error.message) } }
        }
    }
}
