package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.network.StoryAuthor
import one.zrp.social.mobile.network.StoryItem
import one.zrp.social.mobile.network.UserStories

data class StoryViewerUiState(
    val author: StoryAuthor? = null,
    val stories: List<StoryItem> = emptyList(),
    val isOwnStories: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null,
    // Reply-composer state - a story reply is a private DM to the
    // author (POST /messages with storyId), not a public comment, so
    // it never touches `stories`/`author` above.
    val replyDraft: String = "",
    val isSendingReply: Boolean = false,
    val replyError: String? = null,
    val replySent: Boolean = false,
)

/**
 * Backs a single user's story viewer, but loads the *whole* grouped
 * tray (same one GET /stories call the website's own rail and this
 * app's StoriesRail use) so that finishing this author's stories can
 * hand off straight into the next unseen author's - see
 * advanceToNextUnseenGroup() - rather than closing the fullscreen
 * viewer and forcing the person back to the rail to tap the next
 * avatar themselves, which is what this used to do.
 */
class StoryViewerViewModel(
    private val repository: StoriesRepository,
    private val userId: String,
    private val messagesRepository: MessagesRepository = MessagesRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()

    private var allGroups: List<UserStories> = emptyList()
    private var currentGroupIndex: Int = -1
    private var ownUserId: String? = null

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            ownUserId = repository.getOwnUserId().getOrNull()
            repository.getStories()
                .onSuccess { groups ->
                    allGroups = groups
                    currentGroupIndex = groups.indexOfFirst { g -> g.user.id == userId }
                    applyCurrentGroup(isLoading = false)
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load stories.") }
                }
        }
    }

    private fun applyCurrentGroup(isLoading: Boolean) {
        val group = allGroups.getOrNull(currentGroupIndex)
        _state.update {
            it.copy(
                author = group?.user,
                stories = group?.stories ?: emptyList(),
                isOwnStories = ownUserId != null && group?.user?.id == ownUserId,
                isLoading = isLoading,
                replyDraft = "",
                isSendingReply = false,
                replyError = null,
                replySent = false,
            )
        }
    }

    /**
     * Advances into the next author's stories that still has something
     * unseen, skipping any already fully-viewed group in between - the
     * same "unseen stories still ahead" signal the tray's own rings use.
     * Returns false (and leaves state untouched) once nothing unseen is
     * left, so the caller knows to actually close the viewer instead.
     */
    fun advanceToNextUnseenGroup(): Boolean {
        for (i in (currentGroupIndex + 1) until allGroups.size) {
            if (allGroups[i].stories.any { story -> !story.viewed }) {
                currentGroupIndex = i
                applyCurrentGroup(isLoading = false)
                return true
            }
        }
        return false
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

    fun onReplyDraftChange(text: String) {
        _state.update { it.copy(replyDraft = text, replySent = false) }
    }

    fun sendReply(storyId: String) {
        val current = _state.value
        val content = current.replyDraft.trim()
        val authorId = current.author?.id
        if (content.isEmpty() || current.isSendingReply || authorId == null) return

        _state.update { it.copy(isSendingReply = true, replyError = null) }
        viewModelScope.launch {
            messagesRepository.sendMessage(
                receiverId = authorId,
                content = content,
                storyId = storyId,
            ).onSuccess {
                _state.update {
                    it.copy(isSendingReply = false, replyDraft = "", replySent = true)
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(isSendingReply = false, replyError = error.message ?: "Couldn't send this reply. Please try again.")
                }
            }
        }
    }
}
