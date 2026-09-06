package one.zrp.social.mobile.ui.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ChatMessage

// The website receives new messages over a live socket push; this app
// doesn't have a native socket client yet (see MessagesApi's KDoc), so
// a plain interval poll of the same real endpoint is the honest,
// fully-testable substitute until one is built and verified.
private const val POLL_INTERVAL_MS = 5000L

data class ConversationUiState(
    val messages: List<ChatMessage> = emptyList(),
    val draft: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isSending: Boolean = false,
    val replyingTo: ChatMessage? = null,
    val editingMessageId: String? = null,
    val isSavingEdit: Boolean = false,
    val editError: String? = null,
    val error: String? = null,
)

/**
 * Backs a single conversation - the real message history with one
 * partner (GET /messages/{userId}, which also marks their messages
 * read server-side), real sending (POST /messages, with an optional
 * real reply target), and the same real edit/delete/react actions
 * ChatInterface.tsx exposes per message.
 */
class ConversationViewModel(
    private val repository: MessagesRepository,
    private val partnerId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationUiState())
    val state: StateFlow<ConversationUiState> = _state.asStateFlow()

    init {
        load(isInitial = true)
        pollForNewMessages()
    }

    fun onDraftChange(text: String) {
        _state.update { it.copy(draft = text) }
    }

    fun refresh() = load(isInitial = false)

    fun startReply(message: ChatMessage) {
        _state.update { it.copy(replyingTo = message) }
    }

    fun cancelReply() {
        _state.update { it.copy(replyingTo = null) }
    }

    fun startEdit(message: ChatMessage) {
        _state.update { it.copy(editingMessageId = message.id, editError = null) }
    }

    fun cancelEdit() {
        _state.update { it.copy(editingMessageId = null, editError = null) }
    }

    fun saveEdit(messageId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        _state.update { it.copy(isSavingEdit = true, editError = null) }
        viewModelScope.launch {
            repository.editMessage(messageId, content)
                .onSuccess { updated ->
                    _state.update {
                        it.copy(
                            isSavingEdit = false,
                            editingMessageId = null,
                            messages = it.messages.map { m -> if (m.id == messageId) updated else m },
                        )
                    }
                    onResult(Result.success(Unit))
                }
                .onFailure { error ->
                    _state.update { it.copy(isSavingEdit = false, editError = error.message) }
                    onResult(Result.failure(error))
                }
        }
    }

    fun deleteMessage(messageId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.deleteMessage(messageId)
                .onSuccess {
                    _state.update { it.copy(messages = it.messages.filterNot { m -> m.id == messageId }) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        viewModelScope.launch {
            repository.toggleReaction(messageId, emoji).onSuccess { response ->
                _state.update {
                    it.copy(
                        messages = it.messages.map { m ->
                            if (m.id == messageId) m.copy(reactions = response.reactions) else m
                        },
                    )
                }
            }
        }
    }

    fun send() {
        val content = _state.value.draft.trim()
        if (content.isEmpty() || _state.value.isSending) return
        val replyToId = _state.value.replyingTo?.id

        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            repository.sendMessage(partnerId, content, replyToId)
                .onSuccess { message ->
                    _state.update {
                        it.copy(isSending = false, draft = "", replyingTo = null, messages = it.messages + message)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isSending = false, error = error.message ?: "Couldn't send this message. Please try again.")
                    }
                }
        }
    }

    private fun load(isInitial: Boolean) {
        viewModelScope.launch {
            _state.update {
                if (isInitial) it.copy(isLoading = true, error = null) else it.copy(isRefreshing = true, error = null)
            }

            repository.getConversationMessages(partnerId)
                .onSuccess { list ->
                    _state.update { it.copy(messages = list, isLoading = false, isRefreshing = false) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoading = false, isRefreshing = false, error = error.message ?: "Couldn't load messages.")
                    }
                }
        }
    }

    private fun pollForNewMessages() {
        viewModelScope.launch {
            while (true) {
                delay(POLL_INTERVAL_MS)
                repository.getConversationMessages(partnerId).onSuccess { list ->
                    _state.update { it.copy(messages = list) }
                }
            }
        }
    }
}
