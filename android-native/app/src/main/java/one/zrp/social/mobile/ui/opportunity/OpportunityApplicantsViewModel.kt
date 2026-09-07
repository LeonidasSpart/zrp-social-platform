package one.zrp.social.mobile.ui.opportunity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunityApplication

data class OpportunityApplicantsUiState(
    val isLoading: Boolean = true,
    val applications: List<OpportunityApplication> = emptyList(),
    val busyId: String? = null,
    val error: String? = null,
)

/**
 * Ported from ListingApplicantsPage.tsx - a poster reviewing applicants
 * for one of their own listings over GET /opportunity/{id}/applications,
 * accepting/rejecting/marking-reviewed each one through PUT
 * /opportunity/applications/{id} exactly like the web page does.
 */
class OpportunityApplicantsViewModel(
    private val listingId: String,
    private val repository: OpportunityRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(OpportunityApplicantsUiState())
    val state: StateFlow<OpportunityApplicantsUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getApplicants(listingId)
                .onSuccess { page -> _state.update { it.copy(isLoading = false, applications = page.applications) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun updateStatus(applicationId: String, status: String) {
        _state.update { it.copy(busyId = applicationId) }
        viewModelScope.launch {
            repository.updateApplicationStatus(applicationId, status)
                .onSuccess {
                    _state.update {
                        it.copy(
                            busyId = null,
                            applications = it.applications.map { app -> if (app.id == applicationId) app.copy(status = status) else app },
                        )
                    }
                }
                .onFailure { _state.update { it.copy(busyId = null) } }
        }
    }
}

class OpportunityApplicantsViewModelFactory(
    private val listingId: String,
    private val repository: OpportunityRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = OpportunityApplicantsViewModel(listingId, repository) as T
}
