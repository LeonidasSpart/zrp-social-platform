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
import one.zrp.social.mobile.network.AdminUser
import one.zrp.social.mobile.network.AdminUsersStats

data class AdminUsersUiState(
    val isLoading: Boolean = true,
    val search: String = "",
    val roleFilter: String = "ALL",
    val statusFilter: String = "ALL",
    val users: List<AdminUser> = emptyList(),
    val stats: AdminUsersStats? = null,
    val page: Int = 1,
    val totalPages: Int = 1,
    val busyUserId: String? = null,
    val pendingDeleteId: String? = null,
    // The plan change waiting on its confirm dialog - the user it
    // applies to and the plan they'd be moved onto.
    val pendingPlanUserId: String? = null,
    val pendingPlan: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/users/page.tsx - see AdminApi's own KDoc.
 * Ban toggling works for both ADMIN and MODERATOR (server-side
 * requireStaff); role changes, plan changes and deletion are ADMIN-only
 * server-side (requireAdmin) - AdminUsersScreen only shows those
 * controls when the caller passes isAdmin=true, matching who the server
 * would actually accept the request from.
 *
 * Deletion prompts a real confirm dialog (irreversible), and so does a
 * plan change - PUT /admin/users/{id}/plan grants or revokes paid
 * access outright, without any payment or upgrade request behind it, so
 * it never fires straight off the dropdown. Banning does not - it's a
 * reversible toggle with its own always-visible undo action right next
 * to it, so a confirm step would only add friction.
 * admin_users_ban_confirm stays a real, extracted translation left
 * unused for that reason, matching this codebase's own precedent (see
 * SupportTicketsViewModel's KDoc) for a translated string that exists
 * but isn't wired to a control.
 */
class AdminUsersViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminUsersUiState())
    val state: StateFlow<AdminUsersUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getUsers(s.search, s.page, s.roleFilter, s.statusFilter)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, users = response.users, totalPages = response.totalPages, stats = response.stats)
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() {
        _state.update { it.copy(page = 1) }
        load()
    }

    fun setRoleFilter(role: String) {
        if (role == _state.value.roleFilter) return
        _state.update { it.copy(roleFilter = role, page = 1) }
        load()
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

    fun toggleBan(userId: String) {
        _state.update { it.copy(busyUserId = userId, error = null) }
        viewModelScope.launch {
            repository.toggleBan(userId)
                .onSuccess { result ->
                    _state.update { current ->
                        current.copy(
                            busyUserId = null,
                            users = current.users.map { if (it.id == userId) it.copy(banned = result.banned) else it },
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun changeRole(userId: String, role: String) {
        _state.update { it.copy(busyUserId = userId, error = null) }
        viewModelScope.launch {
            repository.updateUserRole(userId, role)
                .onSuccess { updated ->
                    _state.update { current ->
                        current.copy(
                            busyUserId = null,
                            users = current.users.map { if (it.id == userId) it.copy(role = updated.role) else it },
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun requestPlanChange(userId: String, plan: String) =
        _state.update { it.copy(pendingPlanUserId = userId, pendingPlan = plan) }

    fun cancelPlanChange() = _state.update { it.copy(pendingPlanUserId = null, pendingPlan = null) }

    fun confirmPlanChange() {
        val userId = _state.value.pendingPlanUserId ?: return
        val plan = _state.value.pendingPlan ?: return
        _state.update {
            it.copy(pendingPlanUserId = null, pendingPlan = null, busyUserId = userId, error = null)
        }
        viewModelScope.launch {
            repository.updateUserPlan(userId, plan)
                .onSuccess { updated ->
                    _state.update { current ->
                        current.copy(
                            busyUserId = null,
                            users = current.users.map { if (it.id == userId) it.copy(plan = updated.plan) else it },
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun requestDelete(userId: String) = _state.update { it.copy(pendingDeleteId = userId) }
    fun cancelDelete() = _state.update { it.copy(pendingDeleteId = null) }

    fun confirmDelete() {
        val userId = _state.value.pendingDeleteId ?: return
        _state.update { it.copy(pendingDeleteId = null, busyUserId = userId, error = null) }
        viewModelScope.launch {
            repository.deleteUser(userId)
                .onSuccess {
                    _state.update { current ->
                        current.copy(busyUserId = null, users = current.users.filterNot { it.id == userId })
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyUserId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminUsersViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminUsersViewModel(repository) as T
}
