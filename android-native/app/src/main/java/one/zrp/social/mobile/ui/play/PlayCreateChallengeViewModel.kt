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
import one.zrp.social.mobile.network.TriviaQuestion

data class PlayCreateChallengeUiState(
    val tab: String = "manual",
    val type: String = "TRIVIA",
    val difficulty: String = "medium",
    val title: String = "",
    val description: String = "",
    val questions: List<TriviaQuestion> = listOf(TriviaQuestion(q = "", options = listOf("", ""), correctIndex = 0)),
    val pairs: List<String> = listOf("", "", ""),
    val logicPrompt: String = "",
    val logicAnswerType: String = "choice",
    val logicOptions: List<String> = listOf("", ""),
    val logicCorrectIndex: Int = 0,
    val logicAnswer: String = "",
    val aiTopic: String = "",
    val generating: Boolean = false,
    val aiGenerated: Boolean = false,
    val submitting: Boolean = false,
    val error: String? = null,
    val createdChallengeId: String? = null,
)

/** Create Challenge - ported from CreateChallengePage.tsx: manual per-type builders (trivia/memory/logic) plus an AI-generate tab against POST /play/challenges/generate, both publishing via POST /play/challenges. */
class PlayCreateChallengeViewModel(private val repository: PlayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayCreateChallengeUiState())
    val state: StateFlow<PlayCreateChallengeUiState> = _state.asStateFlow()

    fun setTab(tab: String) = _state.update { it.copy(tab = tab) }
    fun setType(type: String) = _state.update { it.copy(type = type) }
    fun setDifficulty(difficulty: String) = _state.update { it.copy(difficulty = difficulty) }
    fun setTitle(title: String) = _state.update { it.copy(title = title) }
    fun setDescription(description: String) = _state.update { it.copy(description = description) }

    fun setQuestionText(index: Int, text: String) = _state.update { s ->
        s.copy(questions = s.questions.toMutableList().also { it[index] = it[index].copy(q = text) })
    }

    fun setQuestionOption(index: Int, optIndex: Int, text: String) = _state.update { s ->
        s.copy(
            questions = s.questions.toMutableList().also { qs ->
                qs[index] = qs[index].copy(options = qs[index].options.toMutableList().also { it[optIndex] = text })
            },
        )
    }

    fun setQuestionCorrect(index: Int, optIndex: Int) = _state.update { s ->
        s.copy(questions = s.questions.toMutableList().also { it[index] = it[index].copy(correctIndex = optIndex) })
    }

    fun addQuestionOption(index: Int) = _state.update { s ->
        if (s.questions[index].options.size >= 6) return@update s
        s.copy(questions = s.questions.toMutableList().also { qs -> qs[index] = qs[index].copy(options = qs[index].options + "") })
    }

    fun addQuestion() = _state.update { s ->
        if (s.questions.size >= 20) return@update s
        s.copy(questions = s.questions + TriviaQuestion(q = "", options = listOf("", ""), correctIndex = 0))
    }

    fun removeQuestion(index: Int) = _state.update { s ->
        if (s.questions.size <= 1) return@update s
        s.copy(questions = s.questions.toMutableList().also { it.removeAt(index) })
    }

    fun setPair(index: Int, text: String) = _state.update { s ->
        s.copy(pairs = s.pairs.toMutableList().also { it[index] = text })
    }

    fun addPair() = _state.update { s -> if (s.pairs.size >= 12) s else s.copy(pairs = s.pairs + "") }

    fun setLogicPrompt(prompt: String) = _state.update { it.copy(logicPrompt = prompt) }
    fun setLogicAnswerType(type: String) = _state.update { it.copy(logicAnswerType = type) }
    fun setLogicOption(index: Int, text: String) = _state.update { s ->
        s.copy(logicOptions = s.logicOptions.toMutableList().also { it[index] = text })
    }
    fun setLogicCorrectIndex(index: Int) = _state.update { it.copy(logicCorrectIndex = index) }
    fun addLogicOption() = _state.update { s -> if (s.logicOptions.size >= 6) s else s.copy(logicOptions = s.logicOptions + "") }
    fun setLogicAnswer(answer: String) = _state.update { it.copy(logicAnswer = answer) }

    fun setAiTopic(topic: String) = _state.update { it.copy(aiTopic = topic) }

    fun generate() {
        val s = _state.value
        if (s.aiTopic.isBlank() || s.generating) return
        _state.update { it.copy(generating = true, error = null) }
        viewModelScope.launch {
            repository.generateChallenge(s.aiTopic.trim(), s.type, s.difficulty)
                .onSuccess { generated ->
                    _state.update { current ->
                        var next = current.copy(
                            generating = false,
                            aiGenerated = true,
                            tab = "manual",
                            title = generated.title,
                            description = generated.description ?: "",
                        )
                        next = when (val content = generated.content) {
                            is PlayChallengeContent.Trivia -> next.copy(questions = content.content.questions)
                            is PlayChallengeContent.Memory -> next.copy(pairs = content.content.pairs)
                            is PlayChallengeContent.Logic -> if (content.content.options != null) {
                                next.copy(
                                    logicPrompt = content.content.prompt,
                                    logicAnswerType = "choice",
                                    logicOptions = content.content.options,
                                    logicCorrectIndex = content.content.correctIndex ?: 0,
                                )
                            } else {
                                next.copy(
                                    logicPrompt = content.content.prompt,
                                    logicAnswerType = "text",
                                    logicAnswer = content.content.answer ?: "",
                                )
                            }
                        }
                        next
                    }
                }
                .onFailure { _state.update { it.copy(generating = false, error = generateFailedError) } }
        }
    }

    fun publish() {
        val s = _state.value
        if (s.title.isBlank()) {
            _state.update { it.copy(error = titleRequiredError) }
            return
        }
        _state.update { it.copy(submitting = true, error = null) }
        val content: Any = when (s.type) {
            "TRIVIA" -> mapOf("questions" to s.questions)
            "MEMORY" -> mapOf("pairs" to s.pairs.filter { it.isNotBlank() })
            else -> if (s.logicAnswerType == "choice") {
                mapOf("prompt" to s.logicPrompt, "options" to s.logicOptions, "correctIndex" to s.logicCorrectIndex)
            } else {
                mapOf("prompt" to s.logicPrompt, "answer" to s.logicAnswer)
            }
        }
        viewModelScope.launch {
            repository.createChallenge(s.type, s.title.trim(), s.description, s.difficulty, content)
                .onSuccess { challenge -> _state.update { it.copy(submitting = false, createdChallengeId = challenge.id) } }
                .onFailure { _state.update { it.copy(submitting = false, error = createFailedError) } }
        }
    }

    companion object {
        const val titleRequiredError = "titleRequired"
        const val generateFailedError = "generateFailed"
        const val createFailedError = "createFailed"
    }
}

class PlayCreateChallengeViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayCreateChallengeViewModel(repository) as T
}
