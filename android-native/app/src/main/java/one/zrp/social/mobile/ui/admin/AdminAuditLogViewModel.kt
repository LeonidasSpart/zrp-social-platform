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
import one.zrp.social.mobile.network.AdminAuditEntry

data class AdminAuditLogUiState(
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val entries: List<AdminAuditEntry> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    // The three filter fields as typed. They only reach the route when
    // the admin applies them, so a half-typed action doesn't refetch on
    // every keystroke.
    val actionFilter: String = "",
    val targetTypeFilter: String = "",
    val targetIdFilter: String = "",
    val filtersExpanded: Boolean = false,
    val error: String? = null,
)

/**
 * GET /admin/audit-log (requireAdmin - ADMIN only), the immutable
 * record of sensitive admin actions logAdminAction() writes. There is
 * no web page for this route, so nothing is being mirrored here: the
 * screen is a plain reverse-chronological viewer built from the fields
 * the route actually returns, and it is deliberately read-only. An
 * audit trail exists to be read, and nothing in the route offers a way
 * to edit or delete an entry.
 *
 * Pagination is the route's own cursor scheme, not page numbers: each
 * response carries the id to continue from, or null once the log is
 * exhausted. Applying a filter starts a fresh cursor - a cursor from
 * one filtered query means nothing in another.
 */
class AdminAuditLogViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminAuditLogUiState())
    val state: StateFlow<AdminAuditLogUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val current = _state.value
            repository.getAuditLog(
                action = current.actionFilter.trim().ifBlank { null },
                targetType = current.targetTypeFilter.trim().ifBlank { null },
                targetId = current.targetIdFilter.trim().ifBlank { null },
                cursor = null,
            ).onSuccess { response ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        entries = response.entries,
                        nextCursor = response.nextCursor,
                        endReached = response.nextCursor == null,
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isLoading = false, error = error.message) }
            }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoading || current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getAuditLog(
                action = current.actionFilter.trim().ifBlank { null },
                targetType = current.targetTypeFilter.trim().ifBlank { null },
                targetId = current.targetIdFilter.trim().ifBlank { null },
                cursor = current.nextCursor,
            ).onSuccess { response ->
                _state.update {
                    it.copy(
                        isLoadingMore = false,
                        entries = it.entries + response.entries,
                        nextCursor = response.nextCursor,
                        endReached = response.nextCursor == null,
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isLoadingMore = false, error = error.message) }
            }
        }
    }

    fun toggleFilters() = _state.update { it.copy(filtersExpanded = !it.filtersExpanded) }

    fun setActionFilter(value: String) = _state.update { it.copy(actionFilter = value) }
    fun setTargetTypeFilter(value: String) = _state.update { it.copy(targetTypeFilter = value) }
    fun setTargetIdFilter(value: String) = _state.update { it.copy(targetIdFilter = value) }

    fun applyFilters() = load()

    fun clearFilters() {
        _state.update { it.copy(actionFilter = "", targetTypeFilter = "", targetIdFilter = "") }
        load()
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminAuditLogViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminAuditLogViewModel(repository) as T
}
