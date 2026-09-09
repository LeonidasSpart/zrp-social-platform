package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminAppeal

data class AdminAppealsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "pending",
    val appeals: List<AdminAppeal> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    val decisionModalAppealId: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/appeals/page.tsx - the staff side of the
 * user-facing appeals flow (see AppealsApi / settings/appeals). An
 * appeal is either upheld (the original moderation stands) or
 * overturned; only overturning a BAN_USER appeal actually reverses
 * anything automatically server-side, because User.banned is the one
 * moderation outcome with real reversible DB state - the route's own
 * comment spells that out. Everything else records the decision and
 * notifies the user, exactly as web does.
 *
 * The PUT returns the bare updated Appeal row without the user/report
 * relations the list response includes, so a resolved appeal is
 * reloaded rather than patched in place - the same fetchAppeals() the
 * website's own page runs after a successful decision.
 */
class AdminAppealsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminAppealsUiState())
    val state: StateFlow<AdminAppealsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAppeals(filter, page)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, appeals = response.appeals, totalPages = response.totalPages)
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status, page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun openDecisionModal(id: String) = _state.update { it.copy(decisionModalAppealId = id) }
    fun closeDecisionModal() = _state.update { it.copy(decisionModalAppealId = null) }

    fun submitDecision(status: String, resolutionNote: String) {
        val id = _state.value.decisionModalAppealId ?: return
        _state.update { it.copy(decisionModalAppealId = null, updatingId = id, error = null) }
        viewModelScope.launch {
            repository.resolveAppeal(id, status, resolutionNote.ifBlank { null })
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminAppealsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminAppealsViewModel(repository) as T
}
