package one.zrp.social.mobile.ui.ambassadors

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AmbassadorsRepository
import one.zrp.social.mobile.network.AmbassadorCountry

private const val MAX_LANGUAGES = 10
private const val MAX_LINKS = 5

data class AmbassadorApplyUiState(
    val isLoadingCountries: Boolean = true,
    val countries: List<AmbassadorCountry> = emptyList(),
    val countryCode: String? = null,
    val countryPickerQuery: String = "",
    val cityRegion: String = "",
    val languageInput: String = "",
    val languages: List<String> = emptyList(),
    val linkInput: String = "",
    val links: List<String> = emptyList(),
    val motivation: String = "",
    val communityDescription: String = "",
    val audienceSize: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
) {
    val selectedCountryName: String?
        get() = countries.find { it.code == countryCode }?.name

    val filteredCountries: List<AmbassadorCountry>
        get() {
            val q = countryPickerQuery.trim()
            if (q.isEmpty()) return countries
            return countries.filter { it.name.contains(q, ignoreCase = true) }
        }
}

/**
 * Become a ZRP Ambassador - ported from src/app/ambassadors/apply/page.tsx.
 * Submits only ever creates a PENDING application (see
 * AmbassadorsRepository's own KDoc) - this screen never claims the
 * user is an ambassador on success, only that their application is
 * pending review, matching the real server contract exactly. Every
 * field is re-validated server-side regardless of what's checked here
 * (this is UX convenience, not the security boundary).
 */
class AmbassadorApplyViewModel(
    private val repository: AmbassadorsRepository,
    initialCountryCode: String?,
) : ViewModel() {
    private val _state = MutableStateFlow(AmbassadorApplyUiState(countryCode = initialCountryCode))
    val state: StateFlow<AmbassadorApplyUiState> = _state.asStateFlow()

    init {
        loadCountries()
    }

    private fun loadCountries() {
        viewModelScope.launch {
            repository.getCountries()
                .onSuccess { response ->
                    _state.update { it.copy(isLoadingCountries = false, countries = response.countries) }
                }
                .onFailure { _state.update { it.copy(isLoadingCountries = false) } }
        }
    }

    fun onCountrySelect(code: String) {
        _state.update { it.copy(countryCode = code, countryPickerQuery = "") }
    }

    fun onCountryPickerQueryChange(query: String) {
        _state.update { it.copy(countryPickerQuery = query) }
    }

    fun onCityRegionChange(value: String) {
        _state.update { it.copy(cityRegion = value) }
    }

    fun onLanguageInputChange(value: String) {
        _state.update { it.copy(languageInput = value) }
    }

    fun addLanguage() {
        _state.update {
            val value = it.languageInput.trim()
            if (value.isEmpty() || it.languages.contains(value) || it.languages.size >= MAX_LANGUAGES) {
                it.copy(languageInput = "")
            } else {
                it.copy(languages = it.languages + value, languageInput = "")
            }
        }
    }

    fun removeLanguage(value: String) {
        _state.update { it.copy(languages = it.languages - value) }
    }

    fun onLinkInputChange(value: String) {
        _state.update { it.copy(linkInput = value) }
    }

    fun addLink() {
        _state.update {
            val value = it.linkInput.trim()
            if (value.isEmpty() || it.links.contains(value) || it.links.size >= MAX_LINKS) {
                it.copy(linkInput = "")
            } else {
                it.copy(links = it.links + value, linkInput = "")
            }
        }
    }

    fun removeLink(value: String) {
        _state.update { it.copy(links = it.links - value) }
    }

    fun onMotivationChange(value: String) {
        _state.update { it.copy(motivation = value, error = null) }
    }

    fun onCommunityDescriptionChange(value: String) {
        _state.update { it.copy(communityDescription = value) }
    }

    fun onAudienceSizeChange(value: String) {
        if (value.isEmpty() || value.all { it.isDigit() }) {
            _state.update { it.copy(audienceSize = value) }
        }
    }

    fun submit(errCountryRequired: String, errMotivationRequired: String, errGeneric: String) {
        val current = _state.value
        if (current.countryCode.isNullOrEmpty()) {
            _state.update { it.copy(error = errCountryRequired) }
            return
        }
        if (current.motivation.isBlank()) {
            _state.update { it.copy(error = errMotivationRequired) }
            return
        }

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            repository.apply(
                countryCode = current.countryCode,
                cityRegion = current.cityRegion.trim().ifEmpty { null },
                languages = current.languages,
                communityLinks = current.links,
                motivation = current.motivation.trim(),
                communityDescription = current.communityDescription.trim().ifEmpty { null },
                audienceSize = current.audienceSize.toIntOrNull(),
            )
                .onSuccess { _state.update { it.copy(isSubmitting = false, success = true) } }
                .onFailure { e -> _state.update { it.copy(isSubmitting = false, error = e.message ?: errGeneric) } }
        }
    }
}

class AmbassadorApplyViewModelFactory(
    private val repository: AmbassadorsRepository,
    private val initialCountryCode: String?,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AmbassadorApplyViewModel(repository, initialCountryCode) as T
}
