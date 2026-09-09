package one.zrp.social.mobile.ui.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.SearchUser

// Mirrors the real POST /api/conversations MIN_OTHER_PARTICIPANTS -
// the Create button stays disabled below this, matching the route's
// own real requirement rather than letting every tap round-trip to a
// guaranteed 400.
const val GROUP_MIN_OTHER_PARTICIPANTS = 2

data class GroupCreateUiState(
    val name: String = "",
    val selectedUsers: List<SearchUser> = emptyList(),
    val isCreating: Boolean = false,
    val error: String? = null,
)

/**
 * Backs the "New group" flow - real GET /search?type=users for picking
 * members (via UserMultiSelectField), then a real POST
 * /api/conversations. Every rejection the route can return (too few
 * real members, an unknown user id, a blocked user in either direction,
 * a name that's empty/too long) surfaces as this route's own real
 * message (zrpErrorMessage(), see MessagesRepository.createGroup) -
 * never a native-invented validation copy.
 */
class GroupCreateViewModel(private val repository: MessagesRepository) : ViewModel() {
    private val _state = MutableStateFlow(GroupCreateUiState())
    val state: StateFlow<GroupCreateUiState> = _state.asStateFlow()

    fun onNameChange(name: String) {
        _state.update { it.copy(name = name, error = null) }
    }

    fun onSelectedUsersChange(users: List<SearchUser>) {
        _state.update { it.copy(selectedUsers = users, error = null) }
    }

    fun canCreate(): Boolean {
        val current = _state.value
        return current.name.trim().isNotEmpty() &&
            current.selectedUsers.size >= GROUP_MIN_OTHER_PARTICIPANTS &&
            !current.isCreating
    }

    fun create(onCreated: (conversationId: String) -> Unit) {
        if (!canCreate()) return
        val name = _state.value.name.trim()
        val participantIds = _state.value.selectedUsers.map { it.id }

        _state.update { it.copy(isCreating = true, error = null) }
        viewModelScope.launch {
            repository.createGroup(name, participantIds)
                .onSuccess { detail ->
                    _state.update { it.copy(isCreating = false) }
                    onCreated(detail.id)
                }
                .onFailure { error ->
                    _state.update { it.copy(isCreating = false, error = error.message ?: "Couldn't create this group.") }
                }
        }
    }
}

class GroupCreateViewModelFactory(private val repository: MessagesRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return GroupCreateViewModel(repository) as T
    }
}
