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
import one.zrp.social.mobile.network.AdminAmbassadorProfile

data class AdminAmbassadorsUiState(
    val isLoading: Boolean = true,
    // "" is the website's own "All" tab - the route filters on a real
    // AmbassadorStatus and ignores anything else, so all means sending
    // no status at all.
    val statusFilter: String = "PENDING",
    val search: String = "",
    val profiles: List<AdminAmbassadorProfile> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val busyUserId: String? = null,
    // reject/suspend collect a reason first; approve/restore only need
    // a plain confirm - same split the real PATCH route expects.
    val reasonModalUserId: String? = null,
    val reasonModalAction: String? = null,
    val confirmUserId: String? = null,
    val confirmAction: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/ambassadors/page.tsx - the review queue for
 * real AmbassadorProfile applications. See
 * src/app/api/admin/ambassadors/[id]/route.ts's own comment for the
 * exact state machine this mirrors: approve/reject need PENDING,
 * suspend needs APPROVED, restore needs SUSPENDED - anything else 409s
 * server-side, which is the real boundary this UI only reflects.
 */
class AdminAmbassadorsViewModel(private val repository: AmbassadorsRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminAmbassadorsUiState())
    val state: StateFlow<AdminAmbassadorsUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAdminProfiles(
                status = s.statusFilter.ifBlank { null },
                search = s.search.trim().ifBlank { null },
                page = s.page,
                limit = 20,
            )
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            profiles = response.profiles,
                            counts = response.counts,
                            totalPages = response.pagination?.totalPages ?: 1,
                        )
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

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() {
        _state.update { it.copy(page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun requestAction(userId: String, action: String) {
        if (action == "approve" || action == "restore") {
            _state.update { it.copy(confirmUserId = userId, confirmAction = action) }
        } else {
            _state.update { it.copy(reasonModalUserId = userId, reasonModalAction = action) }
        }
    }

    fun cancelConfirm() = _state.update { it.copy(confirmUserId = null, confirmAction = null) }

    fun confirmAction() {
        val userId = _state.value.confirmUserId ?: return
        val action = _state.value.confirmAction ?: return
        _state.update { it.copy(confirmUserId = null, confirmAction = null) }
        act(userId, action, null)
    }

    fun cancelReasonModal() = _state.update { it.copy(reasonModalUserId = null, reasonModalAction = null) }

    fun submitReasonAction(reason: String) {
        val userId = _state.value.reasonModalUserId ?: return
        val action = _state.value.reasonModalAction ?: return
        _state.update { it.copy(reasonModalUserId = null, reasonModalAction = null) }
        act(userId, action, reason.ifBlank { null })
    }

    private fun act(userId: String, action: String, reason: String?) {
        _state.update { it.copy(busyUserId = userId, error = null) }
        viewModelScope.launch {
            repository.reviewAmbassador(userId, action, reason)
                .onSuccess {
                    _state.update { it.copy(busyUserId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminAmbassadorsViewModelFactory(private val repository: AmbassadorsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminAmbassadorsViewModel(repository) as T
}
