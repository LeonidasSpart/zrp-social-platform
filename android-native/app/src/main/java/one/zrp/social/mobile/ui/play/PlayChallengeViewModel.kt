package one.zrp.social.mobile.ui.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PlayChallengeContent
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.data.parsedContent
import one.zrp.social.mobile.network.PlayChallengeDetail
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.SubmitAttemptResponse

data class PlayChallengeUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val challenge: PlayChallengeDetail? = null,
    val content: PlayChallengeContent? = null,
    val ownUserId: String? = null,
    val isSubmitting: Boolean = false,
    val result: SubmitAttemptResponse? = null,
    val error: String? = null,
    val isSharing: Boolean = false,
    val shared: Boolean = false,
    val showDuelPanel: Boolean = false,
    val opponent: SearchUser? = null,
    val sendingDuel: Boolean = false,
    val duelSent: Boolean = false,
)

/**
 * Play a challenge - ported from PlayChallengePage.tsx. Renders the
 * matching TriviaPlayerView/MemoryPlayerView/LogicPlayerView for
 * challenge.type, submits against the real POST
 * /play/challenges/{id}/submit (server scores against the unstripped
 * content), and shows the score/XP/streak/unlocked-achievements result.
 * When duelId is set (played from a duel invite), submissions include
 * it so the server can score both sides against the shared challenge;
 * when it's null, signed-in users can challenge a friend to the same
 * challenge via the Challenge a Friend panel, exactly like web only
 * shows that panel outside of duel play.
 */
class PlayChallengeViewModel(
    private val challengeId: String,
    private val duelId: String?,
    private val repository: PlayRepository,
    private val postsRepository: PostsRepository = PostsRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(PlayChallengeUiState())
    val state: StateFlow<PlayChallengeUiState> = _state.asStateFlow()

    val isDuelPlay: Boolean get() = duelId != null

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getChallenge(challengeId)
                .onSuccess { challenge ->
                    _state.update { it.copy(isLoading = false, challenge = challenge, content = challenge.parsedContent()) }
                }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun submitTrivia(answers: List<Int>, timeMs: Long) {
        submit { repository.submitAttempt(challengeId, answers = answers, timeMs = timeMs, duelId = duelId) }
    }

    fun submitMemory(moves: Int, matchedPairs: Int, timeMs: Long) {
        submit { repository.submitAttempt(challengeId, moves = moves, matchedPairs = matchedPairs, timeMs = timeMs, duelId = duelId) }
    }

    fun submitLogic(answerIndex: Int?, answerText: String?, timeMs: Long) {
        submit { repository.submitAttempt(challengeId, answerIndex = answerIndex, answerText = answerText, timeMs = timeMs, duelId = duelId) }
    }

    private fun submit(call: suspend () -> Result<SubmitAttemptResponse>) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            call()
                .onSuccess { response -> _state.update { it.copy(isSubmitting = false, result = response) } }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message ?: submitFailedError) } }
        }
    }

    fun shareResult() {
        val s = _state.value
        val challenge = s.challenge ?: return
        val result = s.result ?: return
        _state.update { it.copy(isSharing = true) }
        viewModelScope.launch {
            postsRepository.createPost(
                content = "I just scored ${result.score}/${result.maxScore} on \"${challenge.title}\" in ZRP PLAY! 🎮",
            ).onSuccess {
                _state.update { it.copy(isSharing = false, shared = true) }
            }.onFailure {
                _state.update { it.copy(isSharing = false, error = shareFailedError) }
            }
        }
    }

    fun onOpenDuelPanel() {
        _state.update { it.copy(showDuelPanel = true) }
    }

    fun onOpponentChange(user: SearchUser?) {
        _state.update { it.copy(opponent = user) }
    }

    fun sendDuel() {
        val opponent = _state.value.opponent ?: return
        _state.update { it.copy(sendingDuel = true, error = null) }
        viewModelScope.launch {
            repository.createDuel(challengeId, opponent.id)
                .onSuccess { _state.update { it.copy(sendingDuel = false, duelSent = true) } }
                .onFailure { error -> _state.update { it.copy(sendingDuel = false, error = error.message ?: duelCreateFailedError) } }
        }
    }

    companion object {
        const val submitFailedError = "submitFailed"
        const val duelCreateFailedError = "duelCreateFailed"
        const val shareFailedError = "shareFailed"
    }
}

class PlayChallengeViewModelFactory(
    private val challengeId: String,
    private val duelId: String?,
    private val repository: PlayRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayChallengeViewModel(challengeId, duelId, repository) as T
}
