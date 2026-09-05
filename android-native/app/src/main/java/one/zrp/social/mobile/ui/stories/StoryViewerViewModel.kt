package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.network.StoryItem

data class StoryViewerUiState(
    val stories: List<StoryItem> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

/**
 * Backs a single user's story viewer. There's no dedicated
 * GET /stories/{userId} endpoint - the website's own rail fetches the
 * whole grouped list and picks a user's stories out of it, so this
 * does the same rather than inventing a second server-side query.
 */
class StoryViewerViewModel(
    private val repository: StoriesRepository,
    private val userId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getStories()
                .onSuccess { groups ->
                    val stories = groups.find { group -> group.user.id == userId }?.stories ?: emptyList()
                    _state.update { it.copy(stories = stories, isLoading = false) }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load stories.") }
                }
        }
    }

    fun markViewed(storyId: String) {
        viewModelScope.launch {
            repository.markViewed(storyId).onSuccess {
                _state.update { state ->
                    state.copy(
                        stories = state.stories.map { story ->
                            if (story.id == storyId) story.copy(viewed = true) else story
                        },
                    )
                }
            }
        }
    }

    fun toggleLike(storyId: String) {
        val previousStories = _state.value.stories

        _state.update { state ->
            state.copy(
                stories = state.stories.map { story ->
                    if (story.id == storyId) {
                        val wasLiked = story.liked
                        story.copy(liked = !wasLiked, likeCount = story.likeCount + if (wasLiked) -1 else 1)
                    } else {
                        story
                    }
                },
            )
        }

        viewModelScope.launch {
            repository.toggleLike(storyId).onFailure {
                _state.update { it.copy(stories = previousStories) }
            }
        }
    }
}
