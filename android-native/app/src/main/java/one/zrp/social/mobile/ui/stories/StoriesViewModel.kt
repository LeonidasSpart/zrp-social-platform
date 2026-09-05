package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.network.UserStories

data class StoriesRailUiState(
    val ownUserId: String? = null,
    val groups: List<UserStories> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

/**
 * Backs the Stories rail at the top of Home - the same real 24-hour
 * stories (own + everyone followed) the website's rail shows.
 */
class StoriesViewModel(private val repository: StoriesRepository) : ViewModel() {
    private val _state = MutableStateFlow(StoriesRailUiState())
    val state: StateFlow<StoriesRailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }

            val ownIdResult = repository.getOwnUserId()
            val groupsResult = repository.getStories()

            _state.update {
                it.copy(
                    ownUserId = ownIdResult.getOrNull(),
                    groups = groupsResult.getOrDefault(emptyList()),
                    isLoading = false,
                    error = groupsResult.exceptionOrNull()?.message,
                )
            }
        }
    }
}
