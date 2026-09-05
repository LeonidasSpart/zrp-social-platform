package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.StoriesRepository

data class CreateStoryUiState(
    val content: String = "",
    val isPosting: Boolean = false,
    val error: String? = null,
    val posted: Boolean = false,
)

/**
 * Backs the story composer - a real POST /stories call, text-only for
 * now (see StoriesApi's KDoc on why media upload isn't wired yet).
 */
class CreateStoryViewModel(private val repository: StoriesRepository) : ViewModel() {
    private val _state = MutableStateFlow(CreateStoryUiState())
    val state: StateFlow<CreateStoryUiState> = _state.asStateFlow()

    fun onContentChange(content: String) {
        _state.update { it.copy(content = content, error = null) }
    }

    fun submit() {
        val content = _state.value.content.trim()
        if (content.isEmpty() || _state.value.isPosting) return

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createStory(content)
                .onSuccess { _state.update { CreateStoryUiState(posted = true) } }
                .onFailure { error ->
                    _state.update {
                        it.copy(isPosting = false, error = error.message ?: "Couldn't post this story. Please try again.")
                    }
                }
        }
    }

    fun consumePostedEvent() {
        _state.update { it.copy(posted = false) }
    }
}
