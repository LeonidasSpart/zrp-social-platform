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
import one.zrp.social.mobile.network.AdminJournalistProfile

data class AdminJournalistsUiState(
    val isLoading: Boolean = true,
    // "" is the website's own "All" tab - the route filters on a real
    // JournalistStatus and ignores anything else, so all means sending
    // no status at all.
    val statusFilter: String = "PENDING",
    val search: String = "",
    val profiles: List<AdminJournalistProfile> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val busyUserId: String? = null,
    // Destructive actions (reject/suspend/remove) collect a reason
    // first; approve/restore only need a plain confirm.
    val reasonModalUserId: String? = null,
    val reasonModalAction: String? = null,
    val confirmUserId: String? = null,
    val confirmAction: String? = null,
    val grantUsername: String = "",
    val isGranting: Boolean = false,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/journalists/page.tsx - the review queue for
 * real JournalistProfile applications plus the admin-initiated grant
 * the same page offers. Note the status enum here is UPPERCASE
 * (PENDING/VERIFIED/REJECTED/SUSPENDED) and the mutating route is keyed
 * by the target USER's id, not the profile id - both verbatim from the
 * real routes, see AdminApi's own note.
 *
 * Which actions a row offers follows the transitions the route will
 * actually accept: approve/reject on PENDING, suspend/remove on
 * VERIFIED, restore/remove on SUSPENDED. Anything else 409s
 * server-side, which is the real boundary - this is UX, not gating.
 */
class AdminJournalistsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminJournalistsUiState())
    val state: StateFlow<AdminJournalistsUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getJournalistProfiles(
                status = s.statusFilter.ifBlank { null },
                search = s.search.trim().ifBlank { null },
                page = s.page,
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
            repository.updateJournalistStatus(userId, action, reason)
                .onSuccess {
                    _state.update { it.copy(busyUserId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun setGrantUsername(value: String) = _state.update { it.copy(grantUsername = value) }

    fun grant() {
        // The website strips a leading @ before posting - the route
        // looks the username up exactly as given.
        val username = _state.value.grantUsername.trim().removePrefix("@")
        if (username.isBlank() || _state.value.isGranting) return
        _state.update { it.copy(isGranting = true, error = null) }
        viewModelScope.launch {
            repository.grantJournalistStatus(username)
                .onSuccess {
                    _state.update { it.copy(isGranting = false, grantUsername = "") }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isGranting = false, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminJournalistsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminJournalistsViewModel(repository) as T
}
