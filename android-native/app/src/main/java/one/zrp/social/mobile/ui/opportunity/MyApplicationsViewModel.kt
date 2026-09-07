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

data class MyApplicationsUiState(
    val isLoading: Boolean = true,
    val applications: List<OpportunityApplication> = emptyList(),
    val error: String? = null,
)

/**
 * Ported from MyApplicationsPage.tsx - an applicant's own submissions
 * across every listing over GET /opportunity/my-applications, read-only
 * (tap a row to open its listing). No withdraw action here - web's own
 * page doesn't expose one either, even though PUT
 * /opportunity/applications/{id} supports it.
 */
class MyApplicationsViewModel(private val repository: OpportunityRepository) : ViewModel() {
    private val _state = MutableStateFlow(MyApplicationsUiState())
    val state: StateFlow<MyApplicationsUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getMyApplications()
                .onSuccess { page -> _state.update { it.copy(isLoading = false, applications = page.applications) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }
}

class MyApplicationsViewModelFactory(private val repository: OpportunityRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = MyApplicationsViewModel(repository) as T
}
