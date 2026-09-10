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
import one.zrp.social.mobile.network.ConversationDetail
import one.zrp.social.mobile.network.SearchUser

// A sentinel, not real user-facing text - see saveName's own KDoc.
const val NAME_REQUIRED_ERROR = "GROUP_NAME_REQUIRED"

data class GroupParticipantsUiState(
    val conversation: ConversationDetail? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSavingName: Boolean = false,
    val editableName: String = "",
    val nameError: String? = null,
    val selectedNewUsers: List<SearchUser> = emptyList(),
    val isAddingMembers: Boolean = false,
    val addMembersError: String? = null,
    val removingUserId: String? = null,
    val removeError: String? = null,
    val leftConversation: Boolean = false,
)

/**
 * Backs the "Group info" / participant-management screen: the real
 * member list with role badges (GET /conversations/{id}), adding real
 * members (POST .../participants, any member may - see the route's own
 * KDoc), an OWNER-only rename (PATCH .../{id}) whose button
 * [isOwner] hides for a non-owner as UX only - the real 403 boundary
 * is still the server's own membership.role check, never assumed from
 * this client-side flag alone - and removing a member: self-removal
 * (leaving) is always allowed, removing someone else requires OWNER,
 * exactly mirroring DELETE .../participants/{userId}'s own real check.
 */
class GroupParticipantsViewModel(
    private val repository: MessagesRepository,
    private val conversationId: String,
    private val currentUserId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(GroupParticipantsUiState())
    val state: StateFlow<GroupParticipantsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun isOwner(): Boolean =
        _state.value.conversation?.participants?.firstOrNull { it.userId == currentUserId }?.role == "OWNER"

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getConversationDetail(conversationId)
                .onSuccess { detail ->
                    _state.update { it.copy(conversation = detail, isLoading = false, editableName = detail.name ?: "") }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load this group.") }
                }
        }
    }

    fun onNameChange(name: String) {
        _state.update { it.copy(editableName = name, nameError = null) }
    }

    // nameError holds a real translated string, not raw English - a
    // plain ViewModel can't resolve Android string resources itself
    // (see ConversationViewModel's own ChatAttachmentError KDoc for the
    // established pattern), so GroupParticipantsScreen maps this one
    // sentinel to R.string.group_name_required before rendering it.
    fun saveName() {
        val name = _state.value.editableName.trim()
        if (name.isEmpty()) {
            _state.update { it.copy(nameError = NAME_REQUIRED_ERROR) }
            return
        }
        _state.update { it.copy(isSavingName = true, nameError = null) }
        viewModelScope.launch {
            repository.updateConversation(conversationId, name = name)
                .onSuccess { detail -> _state.update { it.copy(conversation = detail, isSavingName = false) } }
                .onFailure { error -> _state.update { it.copy(isSavingName = false, nameError = error.message) } }
        }
    }

    fun updateAvatar(avatarUrl: String) {
        viewModelScope.launch {
            repository.updateConversation(conversationId, avatarUrl = avatarUrl)
                .onSuccess { detail -> _state.update { it.copy(conversation = detail) } }
                .onFailure { error -> _state.update { it.copy(nameError = error.message) } }
        }
    }

    fun onSelectedNewUsersChange(users: List<SearchUser>) {
        _state.update { it.copy(selectedNewUsers = users, addMembersError = null) }
    }

    fun addSelectedMembers() {
        val ids = _state.value.selectedNewUsers.map { it.id }
        if (ids.isEmpty()) return
        _state.update { it.copy(isAddingMembers = true, addMembersError = null) }
        viewModelScope.launch {
            repository.addParticipants(conversationId, ids)
                .onSuccess { detail ->
                    _state.update {
                        it.copy(conversation = detail, isAddingMembers = false, selectedNewUsers = emptyList())
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isAddingMembers = false, addMembersError = error.message ?: "Couldn't add those members.") }
                }
        }
    }

    // targetUserId == currentUserId is "leave"; anything else is a kick
    // (OWNER-only server-side, see this ViewModel's own KDoc).
    fun removeParticipant(targetUserId: String) {
        _state.update { it.copy(removingUserId = targetUserId, removeError = null) }
        viewModelScope.launch {
            repository.removeParticipant(conversationId, targetUserId)
                .onSuccess {
                    if (targetUserId == currentUserId) {
                        _state.update { it.copy(removingUserId = null, leftConversation = true) }
                    } else {
                        val updated = _state.value.conversation?.let { conv ->
                            conv.copy(participants = conv.participants.filterNot { it.userId == targetUserId })
                        }
                        _state.update { it.copy(conversation = updated, removingUserId = null) }
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(removingUserId = null, removeError = error.message ?: "Couldn't remove this member.") }
                }
        }
    }
}

class GroupParticipantsViewModelFactory(
    private val repository: MessagesRepository,
    private val conversationId: String,
    private val currentUserId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return GroupParticipantsViewModel(repository, conversationId, currentUserId) as T
    }
}
