package one.zrp.social.mobile.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.NotificationsRepository
import one.zrp.social.mobile.network.AppNotification
import one.zrp.social.mobile.network.PostAuthor

enum class NotificationFilterTab { ALL, VERIFIED, FOLLOWS }

enum class FollowBackState { LOADING, DONE }

// The same "collapse like/repost/follow notifications on the same
// target into one row" the website's own groupNotifications does -
// comment/message/mention/etc never group, matching GROUPABLE_TYPES
// there.
data class GroupedNotification(
    val key: String,
    val type: String,
    val users: List<PostAuthor>,
    val latestCreatedAt: String,
    val postId: String?,
    val postContent: String?,
    val read: Boolean,
)

data class NotificationsUiState(
    val notifications: List<AppNotification> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val activeTab: NotificationFilterTab = NotificationFilterTab.ALL,
    val followBackState: Map<String, FollowBackState> = emptyMap(),
    val error: String? = null,
) {
    val grouped: List<GroupedNotification>
        get() {
            val filtered = when (activeTab) {
                NotificationFilterTab.ALL -> notifications
                NotificationFilterTab.VERIFIED -> notifications.filter { !it.fromUser?.badgeType.isNullOrBlank() }
                NotificationFilterTab.FOLLOWS -> notifications.filter { it.type == "follow" }
            }
            return groupNotifications(filtered)
        }
}

private val GROUPABLE_TYPES = setOf("like", "repost", "follow")

private fun groupNotifications(list: List<AppNotification>): List<GroupedNotification> {
    val result = mutableListOf<GroupedNotification>()
    val indexByKey = mutableMapOf<String, Int>()

    for (n in list) {
        val fromUser = n.fromUser ?: continue

        if (n.type !in GROUPABLE_TYPES) {
            result.add(
                GroupedNotification(
                    key = n.id,
                    type = n.type,
                    users = listOf(fromUser),
                    latestCreatedAt = n.createdAt,
                    postId = n.post?.id,
                    postContent = n.post?.content,
                    read = n.read,
                ),
            )
            continue
        }

        val groupKey = "${n.type}:${n.post?.id ?: "global"}"
        val existingIndex = indexByKey[groupKey]
        if (existingIndex != null) {
            val g = result[existingIndex]
            val users = if (g.users.none { it.id == fromUser.id }) g.users + fromUser else g.users
            result[existingIndex] = g.copy(users = users, read = g.read && n.read)
        } else {
            indexByKey[groupKey] = result.size
            result.add(
                GroupedNotification(
                    key = groupKey,
                    type = n.type,
                    users = listOf(fromUser),
                    latestCreatedAt = n.createdAt,
                    postId = n.post?.id,
                    postContent = n.post?.content,
                    read = n.read,
                ),
            )
        }
    }

    return result
}

/**
 * Backs the Notifications tab: the same real GET /notifications list
 * the website's /notifications page uses, the same "opening the list
 * marks everything read" behavior, the same All/Verified/Follows filter
 * tabs, the same like/repost/follow grouping, and the same real
 * "Follow back" action on a lone follow notification.
 */
class NotificationsViewModel(private val repository: NotificationsRepository) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        load(isInitial = true)
    }

    fun refresh() = load(isInitial = false)

    fun setTab(tab: NotificationFilterTab) {
        _state.update { it.copy(activeTab = tab) }
    }

    fun followBack(username: String, userId: String) {
        if (_state.value.followBackState.containsKey(userId)) return
        _state.update { it.copy(followBackState = it.followBackState + (userId to FollowBackState.LOADING)) }
        viewModelScope.launch {
            repository.toggleFollow(username)
                .onSuccess { _state.update { it.copy(followBackState = it.followBackState + (userId to FollowBackState.DONE)) } }
                .onFailure { _state.update { it.copy(followBackState = it.followBackState - userId) } }
        }
    }

    private fun load(isInitial: Boolean) {
        viewModelScope.launch {
            _state.update {
                if (isInitial) it.copy(isLoading = true, error = null) else it.copy(isRefreshing = true, error = null)
            }

            repository.getNotifications()
                .onSuccess { list ->
                    _state.update { it.copy(notifications = list, isLoading = false, isRefreshing = false) }
                    if (list.any { notification -> !notification.read }) {
                        markAllReadLocally()
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoading = false, isRefreshing = false, error = error.message ?: "Couldn't load notifications.")
                    }
                }
        }
    }

    private fun markAllReadLocally() {
        viewModelScope.launch {
            repository.markAllRead().onSuccess {
                _state.update { state ->
                    state.copy(notifications = state.notifications.map { it.copy(read = true) })
                }
            }
        }
    }
}
