package one.zrp.social.mobile.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.data.NotificationsRepository

/**
 * Backs the bottom nav's unread-notifications badge - real
 * GET /notifications/unread, the same endpoint the website's bell icon
 * uses for its own unread dot. Scoped above the NavHost (created once,
 * in ZrpNavHost, not per-screen) since the badge needs to stay visible
 * while any tab is showing, not just the Notifications tab's own
 * ViewModel, which only exists while that screen is composed.
 */
class UnreadBadgeViewModel(private val repository: NotificationsRepository) : ViewModel() {
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            repository.getUnreadCount().onSuccess { count -> _unreadCount.value = count }
        }
    }

    // Called the moment the Notifications tab is selected - the real
    // GET /notifications/unread count won't reflect the mark-all-read
    // call NotificationsViewModel makes until that request round-trips,
    // so the badge clears immediately here rather than showing a stale
    // count for that gap, then a follow-up refresh() (fired on the next
    // tab switch away) confirms the server agrees.
    fun clear() {
        _unreadCount.value = 0
    }
}

class UnreadBadgeViewModelFactory(private val repository: NotificationsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return UnreadBadgeViewModel(repository) as T
    }
}

/**
 * Backs the bottom nav's unread-messages badge - real GET
 * /messages/unread, mirroring [UnreadBadgeViewModel] above for
 * notifications. No clear(): unlike Notifications, opening the
 * Messages tab (the conversation list) doesn't itself mark anything
 * read on web either - only opening a specific conversation does
 * (ConversationViewModel's own mark-read socket emit) - so there's no
 * "visiting this tab just cleared everything" moment to reflect
 * instantly the way Notifications has.
 */
class UnreadMessagesBadgeViewModel(private val repository: MessagesRepository) : ViewModel() {
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            repository.getUnreadCount().onSuccess { count -> _unreadCount.value = count }
        }
    }
}

class UnreadMessagesBadgeViewModelFactory(private val repository: MessagesRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return UnreadMessagesBadgeViewModel(repository) as T
    }
}
