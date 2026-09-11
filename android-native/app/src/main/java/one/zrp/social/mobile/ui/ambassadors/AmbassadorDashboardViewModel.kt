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
import one.zrp.social.mobile.network.AmbassadorProfile

data class AmbassadorDashboardUiState(
    val isLoading: Boolean = true,
    val error: Boolean = false,
    val profile: AmbassadorProfile? = null,
    val countryName: String? = null,
    val linkCopied: Boolean = false,
) {
    val invitationLink: String?
        get() = profile?.let { "https://zrp.one/signup?ref=${it.invitationCode}" }
}

/**
 * ZRP Global Ambassadors dashboard - ported from src/app/ambassadors/dashboard/page.tsx.
 * Always re-fetches GET /api/ambassadors/me on load: status/level are
 * never cached client-side as a trusted role (see AmbassadorsApi's own
 * KDoc). A user who never applied gets the honest "not applied" empty
 * state, matching the web page exactly - no synthetic preview data.
 *
 * Unlike the web page (which silently treats a fetch failure the same
 * as "never applied"), this shows a distinct error+retry state on a
 * real network failure - collapsing the two would risk telling someone
 * who already applied that they have not, which is worse than an extra
 * state.
 */
class AmbassadorDashboardViewModel(private val repository: AmbassadorsRepository) : ViewModel() {
    private val _state = MutableStateFlow(AmbassadorDashboardUiState())
    val state: StateFlow<AmbassadorDashboardUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            val profileResult = repository.getMyProfile()
            val countriesResult = repository.getCountries()

            profileResult
                .onSuccess { profile ->
                    val countryName = countriesResult.getOrNull()
                        ?.countries
                        ?.find { it.code == profile?.countryCode }
                        ?.name
                        ?: profile?.countryCode
                    _state.update {
                        it.copy(isLoading = false, error = false, profile = profile, countryName = countryName)
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }
        }
    }

    fun onLinkCopied() {
        _state.update { it.copy(linkCopied = true) }
    }

    fun onCopyIndicatorShown() {
        _state.update { it.copy(linkCopied = false) }
    }
}

class AmbassadorDashboardViewModelFactory(private val repository: AmbassadorsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AmbassadorDashboardViewModel(repository) as T
}
