package one.zrp.social.mobile.ui.messages

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationDetail
import one.zrp.social.mobile.network.MessageReaction
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.SocketGroupMessagePreview
import one.zrp.social.mobile.network.SocketGroupTypingPayload
import one.zrp.social.mobile.network.SocketMessageDeletedPayload
import one.zrp.social.mobile.network.SocketMessageEditedPayload
import one.zrp.social.mobile.network.SocketReactionUpdatedPayload
import one.zrp.social.mobile.network.SocketUserStatusPayload
import one.zrp.social.mobile.network.ZrpSocket
import org.json.JSONArray
import org.json.JSONObject

private const val POLL_INTERVAL_MS = 5000L

data class GroupConversationUiState(
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
    // The group's own name/avatar/participant list - see
    // ConversationDetail's own KDoc. Null only until the first real
    // GET /conversations/{id} resolves.
    val conversation: ConversationDetail? = null,
    // Every OTHER participant currently typing, keyed by their real
    // userId (see requestParticipantStatus's own KDoc for why this
    // never needs to filter out the viewer's own id: server.js's
    // socket.to(room) already excludes the sender). Empty set is the
    // honest "nobody typing" state - GroupConversationScreen formats
    // this into "Alice is typing…" / "Alice and Bob are typing…" /
    // "Alice, Bob and 2 others are typing…" via formatTypingIndicator.
    val typingUserIds: Set<String> = emptySet(),
    // Real per-participant presence (server.js's own userStatus Map via
    // "user-status"/"get-status" - the exact same mechanism
    // ConversationViewModel/MessagesViewModel already use for 1:1,
    // reused here per participant rather than a second implementation).
    // Absence of a key means "no answer heard yet", never "offline".
    val presence: Map<String, Boolean> = emptyMap(),
    val isUploadingAttachment: Boolean = false,
    val attachmentUploadProgress: Float = 0f,
    val attachmentError: ChatAttachmentError? = null,
    val isLoadingOlderMessages: Boolean = false,
    val hasMoreOlderMessages: Boolean = true,
    // Set once a real DELETE /conversations/{id}/participants/{selfId}
    // (leaving) or a removal by the owner succeeds - GroupConversationScreen
    // reacts by navigating back to the conversation list, since this
    // screen can no longer show anything real once membership is gone.
    val leftConversation: Boolean = false,
)

/**
 * The real GROUP-chat equivalent of ConversationViewModel - same real
 * REST history (GET /conversations/{id}/messages, paginated) and real
 * Socket.IO push (server.js's "receive-group-message"/"user-typing-group"/
 * "user-status", the group room this screen joins on connect and leaves
 * on cleared - see server.js's own "group:{conversationId}" room KDoc),
 * but with genuine multi-sender semantics: every message resolves its
 * own sender (from the REST include, or from the conversation's already-
 * loaded participant list for a live socket push that only carries a
 * senderId), and reactions/edit/delete reuse the exact same per-message
 * REST endpoints 1:1 messaging already calls (they're already group-aware
 * server-side), just relayed with conversationId instead of receiverId.
 */
class GroupConversationViewModel(
    private val repository: MessagesRepository,
    private val conversationId: String,
    private val currentUserId: String,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(GroupConversationUiState())
    val state: StateFlow<GroupConversationUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private var typingJob: Job? = null
    private val typingClearJobs = mutableMapOf<String, Job>()
    private var isTypingLocally = false
    private val requestedStatusFor = mutableSetOf<String>()

    init {
        loadConversationDetail()
        loadMessages(isInitial = true)
        pollForNewMessages()
        connectSocket()
    }

    private fun connectSocket() {
        val tokenStore = ApiClient.getTokenStore()
        val liveSocket = ZrpSocket.connect(tokenStore)
        socket = liveSocket

        liveSocket.on(Socket.EVENT_CONNECT, Emitter.Listener { liveSocket.emit("join-conversation", conversationId) })

        liveSocket.on("receive-group-message", Emitter.Listener { args ->
            val preview = parsePayload(args, SocketGroupMessagePreview::class.java) ?: return@Listener
            if (preview.conversationId != conversationId) return@Listener
            _state.update { current ->
                if (current.messages.any { it.id == preview.id }) current
                else current.copy(messages = current.messages + preview.toChatMessage())
            }
            clearTyping(preview.senderId)
        })

        liveSocket.on("user-typing-group", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketGroupTypingPayload::class.java) ?: return@Listener
            if (payload.conversationId != conversationId) return@Listener
            if (payload.isTyping) {
                _state.update { it.copy(typingUserIds = it.typingUserIds + payload.userId) }
                // A typer who goes silent without an explicit isTyping=false
                // (backgrounded app, dropped connection) must not leave a
                // stale "typing" indicator forever - the same 4s
                // auto-expiry ChatInterface.tsx's own multi-user typing
                // map uses.
                typingClearJobs[payload.userId]?.cancel()
                typingClearJobs[payload.userId] = viewModelScope.launch {
                    delay(4000)
                    clearTyping(payload.userId)
                }
            } else {
                clearTyping(payload.userId)
            }
        })

        liveSocket.on("message-deleted", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketMessageDeletedPayload::class.java) ?: return@Listener
            _state.update { current -> current.copy(messages = current.messages.filterNot { it.id == payload.messageId }) }
        })

        liveSocket.on("message-edited", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketMessageEditedPayload::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(messages = current.messages.map { if (it.id == payload.message.id) payload.message else it })
            }
        })

        liveSocket.on("reaction-updated", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketReactionUpdatedPayload::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(
                    messages = current.messages.map {
                        if (it.id == payload.messageId) it.copy(reactions = payload.reactions) else it
                    },
                )
            }
        })

        liveSocket.on("user-status", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketUserStatusPayload::class.java) ?: return@Listener
            _state.update { it.copy(presence = it.presence + (payload.userId to (payload.status == "online"))) }
        })
    }

    private fun clearTyping(userId: String) {
        typingClearJobs.remove(userId)?.cancel()
        _state.update { it.copy(typingUserIds = it.typingUserIds - userId) }
    }

    private fun <T> parsePayload(args: Array<out Any>, type: Class<T>): T? {
        val json = args.getOrNull(0) as? JSONObject ?: return null
        return try {
            gson.fromJson(json.toString(), type)
        } catch (e: Exception) {
            null
        }
    }

    override fun onCleared() {
        socket?.let { liveSocket ->
            liveSocket.emit("leave-conversation", conversationId)
            liveSocket.off(Socket.EVENT_CONNECT)
            liveSocket.off("receive-group-message")
            liveSocket.off("user-typing-group")
            liveSocket.off("message-deleted")
            liveSocket.off("message-edited")
            liveSocket.off("reaction-updated")
            liveSocket.off("user-status")
            liveSocket.disconnect()
        }
        socket = null
        typingClearJobs.values.forEach { it.cancel() }
    }

    // Resolves whoever sent a message even for a live socket push, which
    // (see SocketGroupMessagePreview's own KDoc) only ever carries a bare
    // senderId - falls back to the conversation's already-loaded
    // participant list rather than a second per-message user fetch.
    // Returns null only for a sender no longer in the participant list
    // (they left/were removed after sending) and not yet resolved by any
    // REST fetch either - GroupConversationScreen falls back to a plain
    // "Removed member" label for that edge case.
    fun senderFor(message: ChatMessage): PostAuthor? {
        message.sender?.let { return it }
        return _state.value.conversation?.participants?.firstOrNull { it.userId == message.senderId }?.user
    }

    fun isOwnMessage(message: ChatMessage): Boolean = message.senderId == currentUserId

    // Mirrors DELETE /messages/delete/{id}'s own real authorization for a
    // GROUP message exactly (see the route's own KDoc): the sender may
    // always delete their own message; deleting someone ELSE's needs
    // real OWNER role over the group, not merely being a member. Used
    // only to decide whether GroupConversationScreen even shows the
    // Delete action for a message that isn't the viewer's own - the 403
    // this same rule enforces server-side is the real boundary either
    // way.
    fun canDelete(message: ChatMessage): Boolean {
        if (isOwnMessage(message)) return true
        return _state.value.conversation?.participants?.firstOrNull { it.userId == currentUserId }?.role == "OWNER"
    }

    private fun loadConversationDetail() {
        viewModelScope.launch {
            repository.getConversationDetail(conversationId)
                .onSuccess { detail ->
                    _state.update { it.copy(conversation = detail) }
                    requestParticipantStatus(detail)
                }
                .onFailure { error -> _state.update { it.copy(error = error.message ?: "Couldn't load this group.") } }
        }
    }

    // One real "get-status" round trip per OTHER participant, the first
    // time each is seen - mirrors MessagesViewModel's own
    // requestStatusForConversations exactly (see its KDoc), just scoped
    // to this group's own member list instead of every 1:1 partner.
    private fun requestParticipantStatus(detail: ConversationDetail) {
        val liveSocket = socket ?: return
        detail.participants.forEach { participant ->
            if (participant.userId != currentUserId && requestedStatusFor.add(participant.userId)) {
                liveSocket.emit("get-status", participant.userId)
            }
        }
    }

    fun onDraftChange(text: String) {
        _state.update { it.copy(draft = text) }

        val liveSocket = socket ?: return
        if (!isTypingLocally) {
            isTypingLocally = true
            liveSocket.emit("typing-group", JSONObject().put("conversationId", conversationId).put("isTyping", true))
        }
        typingJob?.cancel()
        typingJob = viewModelScope.launch {
            delay(1000)
            isTypingLocally = false
            liveSocket.emit("typing-group", JSONObject().put("conversationId", conversationId).put("isTyping", false))
        }
    }

    fun refresh() = loadMessages(isInitial = false)

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

    fun saveEdit(messageId: String, content: String) {
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
                    emitEditMessage(updated)
                }
                .onFailure { error -> _state.update { it.copy(isSavingEdit = false, editError = error.message) } }
        }
    }

    fun deleteMessage(messageId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.deleteMessage(messageId)
                .onSuccess {
                    _state.update { it.copy(messages = it.messages.filterNot { m -> m.id == messageId }) }
                    socket?.emit(
                        "delete-message",
                        JSONObject().put("messageId", messageId).put("conversationId", conversationId),
                    )
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
                emitReactionUpdate(messageId, response.reactions)
            }
        }
    }

    private fun emitEditMessage(updated: ChatMessage) {
        val liveSocket = socket ?: return
        try {
            liveSocket.emit(
                "edit-message",
                JSONObject()
                    .put("message", JSONObject(gson.toJson(updated)))
                    .put("conversationId", conversationId),
            )
        } catch (e: Exception) {
            // Swallowed - the REST call already succeeded; the other
            // participants pick this up on their own next poll instead.
        }
    }

    private fun emitReactionUpdate(messageId: String, reactions: List<MessageReaction>) {
        val liveSocket = socket ?: return
        try {
            liveSocket.emit(
                "message-reaction",
                JSONObject()
                    .put("messageId", messageId)
                    .put("reactions", JSONArray(gson.toJson(reactions)))
                    .put("conversationId", conversationId),
            )
        } catch (e: Exception) {
            // Swallowed - see emitEditMessage's KDoc.
        }
    }

    fun send() {
        val content = _state.value.draft.trim()
        if (content.isEmpty() || _state.value.isSending) return
        val replyToId = _state.value.replyingTo?.id

        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            repository.sendGroupMessage(conversationId, content, replyToId)
                .onSuccess { message ->
                    _state.update {
                        it.copy(isSending = false, draft = "", replyingTo = null, messages = it.messages + message)
                    }
                    socket?.emit(
                        "send-group-message",
                        JSONObject()
                            .put("conversationId", conversationId)
                            .put("content", content)
                            .put("messageId", message.id),
                    )
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isSending = false, error = error.message ?: "Couldn't send this message. Please try again.")
                    }
                }
        }
    }

    fun dismissAttachmentError() {
        _state.update { it.copy(attachmentError = null) }
    }

    /**
     * Mirrors ConversationViewModel's own onImagePicked exactly - same
     * real chatImage UploadThing router, same 4MB/JPEG-PNG-GIF-WebP
     * limits - then sent through the real group message endpoint instead
     * of the 1:1 one.
     */
    fun onImagePicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        val validTypes = setOf("image/jpeg", "image/png", "image/gif", "image/webp")
        if (mimeType !in validTypes) {
            _state.update { it.copy(attachmentError = ChatAttachmentError.InvalidType) }
            return
        }
        val maxBytes = 4L * 1024 * 1024
        if (size > maxBytes) {
            _state.update { it.copy(attachmentError = ChatAttachmentError.FileTooLarge(4)) }
            return
        }

        _state.update { it.copy(isUploadingAttachment = true, attachmentUploadProgress = 0f, attachmentError = null, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "chatImage",
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = { progress -> _state.update { it.copy(attachmentUploadProgress = progress) } },
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingAttachment = false) }
                sendAttachment(uploaded.url)
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isUploadingAttachment = false,
                        attachmentError = ChatAttachmentError.UploadFailed(error.message ?: "Unknown error"),
                    )
                }
            }
        }
    }

    private fun sendAttachment(imageUrl: String) {
        viewModelScope.launch {
            repository.sendGroupMessage(conversationId, content = "", imageUrl = imageUrl)
                .onSuccess { message ->
                    _state.update { it.copy(messages = it.messages + message) }
                    socket?.emit(
                        "send-group-message",
                        JSONObject()
                            .put("conversationId", conversationId)
                            .put("content", "")
                            .put("messageId", message.id),
                    )
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(attachmentError = ChatAttachmentError.UploadFailed(error.message ?: "Unknown error"))
                    }
                }
        }
    }

    fun leaveGroup(onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.removeParticipant(conversationId, currentUserId)
                .onSuccess {
                    _state.update { it.copy(leftConversation = true) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    private fun loadMessages(isInitial: Boolean) {
        viewModelScope.launch {
            _state.update {
                if (isInitial) it.copy(isLoading = true, error = null) else it.copy(isRefreshing = true, error = null)
            }

            repository.getGroupMessages(conversationId)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            messages = page.items,
                            isLoading = false,
                            isRefreshing = false,
                            hasMoreOlderMessages = page.nextCursor != null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoading = false, isRefreshing = false, error = error.message ?: "Couldn't load messages.")
                    }
                }
        }
    }

    // Same real belt-and-suspenders poll ConversationViewModel keeps
    // running alongside its socket (see its own POLL_INTERVAL_MS KDoc) -
    // only ever widens the current window with newer messages, mirrors
    // mergeWithPolledWindow's own older-history-preserving logic.
    private fun pollForNewMessages() {
        viewModelScope.launch {
            while (true) {
                delay(POLL_INTERVAL_MS)
                repository.getGroupMessages(conversationId).onSuccess { page ->
                    _state.update { it.copy(messages = mergeWithPolledWindow(it.messages, page.items)) }
                }
            }
        }
    }

    private fun mergeWithPolledWindow(current: List<ChatMessage>, polled: List<ChatMessage>): List<ChatMessage> {
        if (polled.isEmpty()) return polled
        val oldestPolledCreatedAt = polled.minOf { it.createdAt }
        val olderHistory = current.filter { it.createdAt < oldestPolledCreatedAt }
        return olderHistory + polled
    }

    fun loadOlderMessages() {
        if (_state.value.isLoadingOlderMessages || !_state.value.hasMoreOlderMessages) return
        val oldestLoadedId = _state.value.messages.firstOrNull()?.id ?: return

        _state.update { it.copy(isLoadingOlderMessages = true) }
        viewModelScope.launch {
            repository.getGroupMessages(conversationId, cursor = oldestLoadedId)
                .onSuccess { page ->
                    _state.update { current ->
                        val existingIds = current.messages.map { it.id }.toSet()
                        val newOlder = page.items.filterNot { it.id in existingIds }
                        current.copy(
                            messages = newOlder + current.messages,
                            isLoadingOlderMessages = false,
                            hasMoreOlderMessages = page.nextCursor != null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingOlderMessages = false) } }
        }
    }
}
