package one.zrp.social.mobile.ui.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PlayRepository

data class PlayAchievementsUiState(
    val isLoading: Boolean = true,
    val unlockedKeys: Set<String> = emptySet(),
)

/** Achievements - ported from PlayAchievementsPage.tsx: the full static catalog, locked/unlocked by the signed-in user's own GET /play/profile/{username}. */
class PlayAchievementsViewModel(private val repository: PlayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayAchievementsUiState())
    val state: StateFlow<PlayAchievementsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val username = repository.getOwnUsername().getOrNull()
            if (username == null) {
                _state.update { it.copy(isLoading = false) }
                return@launch
            }
            repository.getProfile(username)
                .onSuccess { response ->
                    _state.update { it.copy(isLoading = false, unlockedKeys = response.achievements.map { a -> a.key }.toSet()) }
                }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class PlayAchievementsViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayAchievementsViewModel(repository) as T
}
