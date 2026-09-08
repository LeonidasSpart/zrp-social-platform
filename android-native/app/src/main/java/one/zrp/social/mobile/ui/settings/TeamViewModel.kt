package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.TeamLoadOutcome
import one.zrp.social.mobile.data.TeamRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.TeamMember
import one.zrp.social.mobile.network.TeamOwner

enum class ToastType { SUCCESS, ERROR }

data class TeamToast(val type: ToastType, val title: String, val description: String? = null)

data class TeamUiState(
    val isLoading: Boolean = true,
    // False only once GET /api/team itself has 403'd (a free/pro
    // plan) - distinct from isLoading/loadError, the same shape as
    // CreatorViewModel's own isEligible for the identical real reason:
    // a dedicated "why" screen, not a spinner or a generic error.
    val isEligible: Boolean = true,
    val ineligibleMessage: String? = null,
    val loadError: String? = null,
    val members: List<TeamMember> = emptyList(),
    val owner: TeamOwner? = null,
    val plan: String = "free",
    val showAddDialog: Boolean = false,
    val newMemberEmail: String = "",
    val newMemberRole: String = "VIEWER",
    val isSubmitting: Boolean = false,
    val removeTarget: TeamMember? = null,
    val showRemoveDialog: Boolean = false,
    val toast: TeamToast? = null,
)

/**
 * Backs the real Team Management screen (src/app/settings/team/page.tsx)
 * - Business/Enterprise account owners invite existing ZRP users by
 * email with a role, and manage the resulting roster. See TeamApi's own
 * KDoc for the real GET/POST/PATCH/DELETE contract this drives.
 *
 * The website's own "Upgrade to Business or Enterprise" button (routes
 * to /pricing, a crypto plan-upgrade flow this app has never
 * implemented - see native-payment-policy.ts) is deliberately not
 * reproduced here, the same real reason CreatorScreen's own KDoc
 * documents for its identical ineligible-plan screen.
 */
class TeamViewModel(private val repository: TeamRepository) : ViewModel() {
    private val _state = MutableStateFlow(TeamUiState())
    val state: StateFlow<TeamUiState> = _state.asStateFlow()

    private var toastJob: kotlinx.coroutines.Job? = null

    init {
        viewModelScope.launch {
            runCatching { ApiClient.authApi.getSession().user?.plan }
                .getOrNull()
                ?.let { plan -> _state.update { it.copy(plan = plan) } }
        }
        load()
    }

    fun refresh() = load()

    private fun load() {
        _state.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            repository.getTeam()
                .onSuccess { outcome ->
                    when (outcome) {
                        is TeamLoadOutcome.Eligible -> _state.update {
                            it.copy(
                                isLoading = false,
                                isEligible = true,
                                members = outcome.response.members,
                                owner = outcome.response.owner,
                            )
                        }
                        is TeamLoadOutcome.Ineligible -> _state.update {
                            it.copy(isLoading = false, isEligible = false, ineligibleMessage = outcome.message)
                        }
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, loadError = error.message) }
                }
        }
    }

    fun openAddDialog() = _state.update { it.copy(showAddDialog = true, newMemberEmail = "", newMemberRole = "VIEWER") }

    fun dismissAddDialog() = _state.update { it.copy(showAddDialog = false) }

    fun onNewMemberEmailChange(email: String) = _state.update { it.copy(newMemberEmail = email) }

    fun onNewMemberRoleChange(role: String) = _state.update { it.copy(newMemberRole = role) }

    fun addMember() {
        val email = _state.value.newMemberEmail.trim()
        if (email.isEmpty() || _state.value.isSubmitting) return

        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            repository.addMember(email, _state.value.newMemberRole)
                .onSuccess { response ->
                    _state.update { it.copy(isSubmitting = false, showAddDialog = false, newMemberEmail = "") }
                    showToast(TeamToast(ToastType.SUCCESS, "memberAdded", response.member.user.email))
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(isSubmitting = false) }
                    showToast(TeamToast(ToastType.ERROR, "error", error.message))
                }
        }
    }

    fun updateMemberRole(memberId: String, role: String) {
        viewModelScope.launch {
            repository.updateMemberRole(memberId, role)
                .onSuccess {
                    showToast(TeamToast(ToastType.SUCCESS, "roleUpdated", role))
                    load()
                }
                .onFailure { error -> showToast(TeamToast(ToastType.ERROR, "error", error.message)) }
        }
    }

    fun openRemoveDialog(member: TeamMember) = _state.update { it.copy(removeTarget = member, showRemoveDialog = true) }

    fun dismissRemoveDialog() = _state.update { it.copy(removeTarget = null, showRemoveDialog = false) }

    fun confirmRemoveMember() {
        val target = _state.value.removeTarget ?: return
        viewModelScope.launch {
            repository.removeMember(target.id)
                .onSuccess {
                    _state.update { it.copy(showRemoveDialog = false, removeTarget = null) }
                    showToast(TeamToast(ToastType.SUCCESS, "memberRemoved", target.user.email))
                    load()
                }
                .onFailure { error -> showToast(TeamToast(ToastType.ERROR, "error", error.message)) }
        }
    }

    // Matches the website's own showToast: a 5-second auto-dismiss.
    private fun showToast(toast: TeamToast) {
        toastJob?.cancel()
        _state.update { it.copy(toast = toast) }
        toastJob = viewModelScope.launch {
            delay(5000)
            _state.update { it.copy(toast = null) }
        }
    }

    fun dismissToast() {
        toastJob?.cancel()
        _state.update { it.copy(toast = null) }
    }
}

class TeamViewModelFactory(private val repository: TeamRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return TeamViewModel(repository) as T
    }
}
