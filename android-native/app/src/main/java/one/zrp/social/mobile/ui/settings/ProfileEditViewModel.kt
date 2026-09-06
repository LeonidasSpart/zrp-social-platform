package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository

data class ProfileEditUiState(
    val isLoading: Boolean = true,
    val name: String = "",
    val bio: String = "",
    val location: String = "",
    val country: String = "",
    val website: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
)

/**
 * The Profile category's text-field form (name/bio/location/country/
 * website) - the same fields src/app/settings/page.tsx's "Profile"
 * form PUTs to /api/user. Avatar upload and the professional-profile
 * category picker are real, separate web features not covered by this
 * slice (see SettingsRepository's KDoc); this screen edits only what
 * it loads.
 */
class ProfileEditViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(ProfileEditUiState())
    val state: StateFlow<ProfileEditUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val username = repository.getOwnUsername().getOrElse {
                _state.update { state -> state.copy(isLoading = false, error = it.message) }
                return@launch
            }
            repository.getProfile(username)
                .onSuccess { profile ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            name = profile.name.orEmpty(),
                            bio = profile.bio.orEmpty(),
                            location = profile.location.orEmpty(),
                            country = profile.country.orEmpty(),
                            website = profile.website.orEmpty(),
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load your profile.") }
                }
        }
    }

    fun onNameChange(value: String) = _state.update { it.copy(name = value) }
    fun onBioChange(value: String) = _state.update { it.copy(bio = value) }
    fun onLocationChange(value: String) = _state.update { it.copy(location = value) }
    fun onCountryChange(value: String) = _state.update { it.copy(country = value) }
    fun onWebsiteChange(value: String) = _state.update { it.copy(website = value) }

    fun save() {
        val current = _state.value
        if (current.isSaving) return
        _state.update { it.copy(isSaving = true, error = null, saved = false) }
        viewModelScope.launch {
            repository.updateProfile(current.name, current.bio, current.location, current.country, current.website)
                .onSuccess { _state.update { it.copy(isSaving = false, saved = true) } }
                .onFailure { error -> _state.update { it.copy(isSaving = false, error = error.message) } }
        }
    }

    fun consumeSavedEvent() = _state.update { it.copy(saved = false) }
}
