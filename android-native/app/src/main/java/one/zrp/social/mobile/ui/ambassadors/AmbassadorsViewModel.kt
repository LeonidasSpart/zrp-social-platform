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

data class AmbassadorsUiState(
    val isLoading: Boolean = true,
    val error: Boolean = false,
    val countries: List<AmbassadorCountry> = emptyList(),
    val totalAmbassadors: Int = 0,
    val countriesRepresented: Int = 0,
    val searchQuery: String = "",
    val selectedRegion: String? = null,
    val selectedCountry: AmbassadorCountry? = null,
) {
    val filteredCountries: List<AmbassadorCountry>
        get() {
            val q = searchQuery.trim()
            return countries.filter { c ->
                (selectedRegion == null || c.region == selectedRegion) &&
                    (q.isEmpty() || c.name.contains(q, ignoreCase = true) || c.code.equals(q, ignoreCase = true))
            }
        }
}

/**
 * Live data backing AmbassadorsScreen/AmbassadorDashboardScreen -
 * ported from src/components/ambassadors/AmbassadorsExperience.tsx +
 * useAmbassadorCountries.ts. See AmbassadorsApi's own KDoc for the
 * full real contract (public, no auth for countries/stats).
 */
class AmbassadorsViewModel(private val repository: AmbassadorsRepository) : ViewModel() {
    private val _state = MutableStateFlow(AmbassadorsUiState())
    val state: StateFlow<AmbassadorsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            val countriesResult = repository.getCountries()
            val statsResult = repository.getStats()

            countriesResult
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            countries = response.countries,
                            error = false,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }

            statsResult.onSuccess { stats ->
                _state.update {
                    it.copy(totalAmbassadors = stats.totalAmbassadors, countriesRepresented = stats.countriesRepresented)
                }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(searchQuery = query) }
    }

    fun onRegionSelect(region: String?) {
        _state.update { it.copy(selectedRegion = region) }
    }

    fun onCountrySelect(country: AmbassadorCountry?) {
        _state.update { it.copy(selectedCountry = country) }
    }
}

class AmbassadorsViewModelFactory(private val repository: AmbassadorsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AmbassadorsViewModel(repository) as T
}
