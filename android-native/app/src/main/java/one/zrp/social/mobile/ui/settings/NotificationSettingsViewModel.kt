package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.network.EmailPreferences

data class NotificationSettingsUiState(
    val isLoading: Boolean = true,
    val preferences: EmailPreferences = EmailPreferences(),
    // Which single key is mid-save, matching EmailPreferences.tsx's own
    // per-toggle `saving` state (disables just that one row's Switch,
    // not the whole screen).
    val savingKey: String? = null,
    val error: String? = null,
)

/**
 * The "Notifications" settings category - GET/PUT /api/user/email-
 * preferences, the same six email-notification toggles
 * EmailPreferences.tsx renders (mentions, direct messages, likes,
 * comments, new followers, reposts). Web has no separate in-app
 * notification-type preferences - this is the whole feature.
 */
class NotificationSettingsViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(NotificationSettingsUiState())
    val state: StateFlow<NotificationSettingsUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getEmailPreferences()
                .onSuccess { prefs -> _state.update { it.copy(isLoading = false, preferences = prefs) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setMentions(value: Boolean) = save("mentions", value, _state.value.preferences.copy(mentions = value))
    fun setMessages(value: Boolean) = save("messages", value, _state.value.preferences.copy(messages = value))
    fun setLikes(value: Boolean) = save("likes", value, _state.value.preferences.copy(likes = value))
    fun setComments(value: Boolean) = save("comments", value, _state.value.preferences.copy(comments = value))
    fun setFollows(value: Boolean) = save("follows", value, _state.value.preferences.copy(follows = value))
    fun setReposts(value: Boolean) = save("reposts", value, _state.value.preferences.copy(reposts = value))

    private fun save(key: String, value: Boolean, next: EmailPreferences) {
        val previous = _state.value.preferences
        _state.update { it.copy(preferences = next, savingKey = key, error = null) }
        viewModelScope.launch {
            repository.updateEmailPreference(key, value)
                .onSuccess { response -> _state.update { it.copy(savingKey = null, preferences = response.preferences) } }
                .onFailure { error -> _state.update { it.copy(savingKey = null, preferences = previous, error = error.message) } }
        }
    }
}

class NotificationSettingsViewModelFactory(private val repository: SettingsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return NotificationSettingsViewModel(repository) as T
    }
}
