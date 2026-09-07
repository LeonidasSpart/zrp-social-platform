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
import one.zrp.social.mobile.network.AdminReport

data class AdminReportsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "pending",
    val reports: List<AdminReport> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    val actionModalReportId: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/reports/page.tsx - the review queue for the
 * real polymorphic Report model (post/comment/listing/challenge/
 * opportunity/campaign, see AdminApi's own KDoc). Reviewing here only
 * records a status/actionType/actionNote on the Report row itself, the
 * same as web - it does not itself delete the reported content or ban
 * anyone, matching the real PUT /admin/reports/{id} route exactly. An
 * admin who chooses "Delete post" as the action type still has to go
 * delete that post from AdminPostsScreen separately, same as the
 * website's own admin reports page requires.
 */
class AdminReportsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminReportsUiState())
    val state: StateFlow<AdminReportsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getReports(filter, page)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, reports = response.reports, totalPages = response.totalPages)
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

    fun markReviewed(id: String) = updateStatus(id, "reviewed")
    fun dismiss(id: String) = updateStatus(id, "dismissed")

    fun openActionModal(id: String) = _state.update { it.copy(actionModalReportId = id) }
    fun closeActionModal() = _state.update { it.copy(actionModalReportId = null) }

    fun submitAction(actionType: String, actionNote: String) {
        val id = _state.value.actionModalReportId ?: return
        _state.update { it.copy(actionModalReportId = null) }
        updateStatus(id, "actioned", actionType, actionNote)
    }

    private fun updateStatus(id: String, status: String, actionType: String? = null, actionNote: String? = null) {
        _state.update { it.copy(updatingId = id, error = null) }
        viewModelScope.launch {
            repository.updateReport(id, status, actionType, actionNote)
                .onSuccess { updated ->
                    _state.update { current ->
                        current.copy(
                            updatingId = null,
                            reports = current.reports.map { if (it.id == updated.id) updated else it },
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminReportsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminReportsViewModel(repository) as T
}
