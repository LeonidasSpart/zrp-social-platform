package one.zrp.social.mobile.ui.moderation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ProfileRepository

enum class ModerationListMode { BLOCKED, MUTED }

data class ModerationListItem(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val bio: String?,
    val followerCount: Int,
    val actionDate: String,
)

data class ModerationListUiState(
    val items: List<ModerationListItem> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val togglingId: String? = null,
)

/**
 * Drives both the Blocked-users and Muted-users screens - the same
 * real GET /users/blocked and GET /users/muted endpoints the website's
 * own settings pages use (src/app/settings/blocked|muted/page.tsx).
 * Both endpoints return a bare array with no pagination, matching the
 * website's own handling (a user rarely blocks/mutes enough people to
 * need paging here).
 */
class ModerationListViewModel(
    private val repository: ProfileRepository,
    private val mode: ModerationListMode,
) : ViewModel() {
    private val _state = MutableStateFlow(ModerationListUiState())
    val state: StateFlow<ModerationListUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = when (mode) {
                ModerationListMode.BLOCKED -> repository.getBlockedUsers().map { users ->
                    users.map {
                        ModerationListItem(
                            id = it.id,
                            username = it.username,
                            name = it.name,
                            avatarUrl = it.avatarUrl,
                            badgeType = it.badgeType,
                            bio = it.bio,
                            followerCount = it._count.followers,
                            actionDate = it.blockedAt,
                        )
                    }
                }
                ModerationListMode.MUTED -> repository.getMutedUsers().map { users ->
                    users.map {
                        ModerationListItem(
                            id = it.id,
                            username = it.username,
                            name = it.name,
                            avatarUrl = it.avatarUrl,
                            badgeType = it.badgeType,
                            bio = it.bio,
                            followerCount = it._count.followers,
                            actionDate = it.mutedAt,
                        )
                    }
                }
            }
            result
                .onSuccess { items -> _state.update { it.copy(items = items, isLoading = false) } }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load this list.") }
                }
        }
    }

    fun removeFromList(userId: String, username: String) {
        val previousItems = _state.value.items
        _state.update {
            it.copy(togglingId = userId, items = it.items.filterNot { item -> item.id == userId })
        }
        viewModelScope.launch {
            val result = when (mode) {
                ModerationListMode.BLOCKED -> repository.toggleBlock(username).map { Unit }
                ModerationListMode.MUTED -> repository.toggleMute(userId).map { Unit }
            }
            result.onFailure { _state.update { it.copy(items = previousItems) } }
            _state.update { it.copy(togglingId = null) }
        }
    }
}
