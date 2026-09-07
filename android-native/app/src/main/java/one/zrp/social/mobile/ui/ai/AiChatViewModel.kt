package one.zrp.social.mobile.ui.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AiRepository

data class AiChatMessageUi(
    val id: String,
    val role: String,
    val content: String,
)

data class AiChatUiState(
    val messages: List<AiChatMessageUi> = emptyList(),
    val input: String = "",
    val isSending: Boolean = false,
    val conversationId: String? = null,
    val remaining: Int? = null,
    val error: String? = null,
)

/**
 * ZRP AI - ported from AIChat.tsx. See AiApi's own KDoc for why this
 * always sends `stream: false` rather than reproducing web's own SSE
 * token-by-token rendering - the conversation, the per-plan daily
 * counter, and every real constraint are identical either way.
 *
 * AIChat.tsx itself also computes a `plan`/`planLabels` pair
 * ("Free (10/day)", "Pro (50/day)", ...) but never actually renders
 * either anywhere in its JSX - genuinely dead code on the website
 * too, so there's no real state to port here.
 */
class AiChatViewModel(
    private val repository: AiRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AiChatUiState())
    val state: StateFlow<AiChatUiState> = _state.asStateFlow()

    fun onInputChange(value: String) = _state.update { it.copy(input = value) }

    fun sendMessage() {
        val s = _state.value
        val text = s.input.trim()
        if (text.isEmpty() || s.isSending) return

        val userMessage = AiChatMessageUi(id = "temp-user-${System.currentTimeMillis()}", role = "user", content = text)
        _state.update { it.copy(messages = it.messages + userMessage, input = "", isSending = true, error = null) }

        viewModelScope.launch {
            repository.sendMessage(text, s.conversationId)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            messages = it.messages + AiChatMessageUi(
                                id = response.message.id,
                                role = "assistant",
                                content = response.message.content,
                            ),
                            isSending = false,
                            conversationId = response.conversationId,
                            remaining = response.remaining,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isSending = false, error = error.message ?: genericErrorSentinel) }
                }
        }
    }

    fun startNewChat() {
        _state.update { AiChatUiState() }
    }

    companion object {
        const val genericErrorSentinel = "genericError"
    }
}

class AiChatViewModelFactory(
    private val repository: AiRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AiChatViewModel(repository) as T
}
