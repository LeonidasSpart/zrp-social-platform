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

data class NotificationsUiState(
    val notifications: List<AppNotification> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

/**
 * Backs the Notifications tab: the same real GET /notifications list
 * the website's /notifications page uses, and the same "opening the
 * list marks everything read" behavior (see that page's own
 * useEffect - it fires PUT /notifications whenever the fetched list
 * contains an unread one).
 */
class NotificationsViewModel(private val repository: NotificationsRepository) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        load(isInitial = true)
    }

    fun refresh() = load(isInitial = false)

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
