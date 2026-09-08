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
import one.zrp.social.mobile.network.MessageReaction
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.SocketMessageDeletedPayload
import one.zrp.social.mobile.network.SocketMessageEditedPayload
import one.zrp.social.mobile.network.SocketMessagePreview
import one.zrp.social.mobile.network.SocketMessageReadPayload
import one.zrp.social.mobile.network.SocketReactionUpdatedPayload
import one.zrp.social.mobile.network.SocketTypingPayload
import one.zrp.social.mobile.network.ZrpSocket
import org.json.JSONArray
import org.json.JSONObject

// The website receives new messages over a live socket push (see
// ZrpSocket's own KDoc for why this app now opens the same real
// connection). It also keeps its own 5-second poll of the same REST
// endpoint running the whole time regardless (ChatInterface.tsx's own
// `setInterval(fetchMessages, 5000)`, alongside its socket listeners) -
// this matches that exact belt-and-suspenders design rather than
// replacing it: the poll is what fills in anything a socket event only
// carries partially (see SocketMessagePreview) and covers any event
// dropped by a flaky connection.
private const val POLL_INTERVAL_MS = 5000L

/**
 * An attachment problem the screen needs to show translated - kept
 * separate from a plain string the same way CallViewModel's own
 * CallError is, since a plain ViewModel can't resolve Android string
 * resources itself; ConversationScreen maps each case to its real,
 * translated chat.err* string. Shared across image/video/document
 * attachments rather than one sealed class per kind: web's own
 * handleDocumentUpload/handleVideoUpload (ChatInterface.tsx) reuse the
 * exact same chat.errFileTooLarge/errInvalidFileType alert text written
 * for images (down to the literal "JPEG, PNG, GIF, and WebP" wording)
 * for every attachment kind's too-large/wrong-type case - a real,
 * confirmed web quirk this mirrors rather than invents.
 */
sealed class ChatAttachmentError {
    data class FileTooLarge(val maxMb: Int) : ChatAttachmentError()
    object InvalidType : ChatAttachmentError()
    data class UploadFailed(val detail: String) : ChatAttachmentError()
}

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
    val partnerTyping: Boolean = false,
    val socketConnected: Boolean = false,
    // Derived from whichever loaded message first carries a real
    // sender/receiver - see ConversationViewModel's own load(). Null
    // only until the first page of history (or the poll) resolves it,
    // same as ChatInterface.tsx itself has no receiver identity beyond
    // its own receiverId/receiverName/receiverAvatar props until then.
    val partner: PostAuthor? = null,
    // Mirrors ChatInterface.tsx's own uploadingImage flag - a single
    // shared in-flight/progress/error trio, not one set per attachment
    // kind, since web itself calls the same setUploadingImage(true) from
    // handleImageUpload/handleDocumentUpload/handleVideoUpload alike
    // (there's no separate uploadingVideo/uploadingDocument state on
    // web to mirror). The picked file uploads immediately (not staged
    // for send()) and sends itself as soon as the upload resolves, same
    // as web does via useUploadThing's onClientUploadComplete ->
    // sendMessage(content, url).
    val isUploadingAttachment: Boolean = false,
    val attachmentUploadProgress: Float = 0f,
    val attachmentError: ChatAttachmentError? = null,
    // Mirrors ChatInterface.tsx's own isRecording/recordingSeconds -
    // the composer swaps to a dedicated recording sub-bar while this is
    // true (see ConversationScreen). The actual MediaRecorder lives in
    // ConversationScreen itself (it needs a Context/File, which this
    // ViewModel deliberately never holds - see MediaUploadRepository's
    // own KDoc for the established convention); this ViewModel only
    // owns the UI-facing timer and the post-recording upload+send.
    val isRecording: Boolean = false,
    val recordingSeconds: Int = 0,
)

/**
 * Backs a single conversation - the real message history with one
 * partner (GET /messages/{userId}, which also marks their messages
 * read server-side), real sending (POST /messages, with an optional
 * real reply target), the same real edit/delete/react actions
 * ChatInterface.tsx exposes per message, and now the same real-time
 * Socket.IO push (server.js) the website's own ChatInterface.tsx uses -
 * connected on init, disconnected in onCleared() so a live handshake
 * never outlives the screen that opened it.
 */
class ConversationViewModel(
    private val repository: MessagesRepository,
    private val partnerId: String,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationUiState())
    val state: StateFlow<ConversationUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private var typingJob: Job? = null
    private var recordingTimerJob: Job? = null
    private var isTypingLocally = false

    init {
        load(isInitial = true)
        pollForNewMessages()
        connectSocket()
    }

    private fun connectSocket() {
        val tokenStore = ApiClient.getTokenStore()
        val liveSocket = ZrpSocket.connect(tokenStore)
        socket = liveSocket

        liveSocket.on(Socket.EVENT_CONNECT, Emitter.Listener { _state.update { it.copy(socketConnected = true) } })
        liveSocket.on(Socket.EVENT_DISCONNECT, Emitter.Listener { _state.update { it.copy(socketConnected = false) } })
        liveSocket.on(Socket.EVENT_CONNECT_ERROR, Emitter.Listener { _state.update { it.copy(socketConnected = false) } })

        liveSocket.on("receive-message", Emitter.Listener { args ->
            val preview = parsePayload(args, SocketMessagePreview::class.java) ?: return@Listener
            if (preview.senderId != partnerId) return@Listener

            _state.update { current ->
                if (current.messages.any { it.id == preview.id }) current
                else current.copy(messages = current.messages + preview.toChatMessage())
            }

            liveSocket.emit("mark-read", JSONObject().put("messageId", preview.id))
        })

        liveSocket.on("message-sent", Emitter.Listener { args ->
            val preview = parsePayload(args, SocketMessagePreview::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(messages = current.messages.map { if (it.id == preview.id) preview.toChatMessage() else it })
            }
        })

        liveSocket.on("user-typing", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketTypingPayload::class.java) ?: return@Listener
            if (payload.userId == partnerId) {
                _state.update { it.copy(partnerTyping = payload.isTyping) }
            }
        })

        liveSocket.on("message-read", Emitter.Listener { args ->
            val payload = parsePayload(args, SocketMessageReadPayload::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(
                    messages = current.messages.map { if (it.id == payload.messageId) it.copy(read = true) else it },
                )
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
            liveSocket.off(Socket.EVENT_CONNECT)
            liveSocket.off(Socket.EVENT_DISCONNECT)
            liveSocket.off(Socket.EVENT_CONNECT_ERROR)
            liveSocket.off("receive-message")
            liveSocket.off("message-sent")
            liveSocket.off("user-typing")
            liveSocket.off("message-read")
            liveSocket.off("message-deleted")
            liveSocket.off("message-edited")
            liveSocket.off("reaction-updated")
            liveSocket.disconnect()
        }
        socket = null
    }

    fun onDraftChange(text: String) {
        _state.update { it.copy(draft = text) }

        val liveSocket = socket ?: return
        if (!isTypingLocally) {
            isTypingLocally = true
            liveSocket.emit("typing", JSONObject().put("receiverId", partnerId).put("isTyping", true))
        }
        typingJob?.cancel()
        typingJob = viewModelScope.launch {
            delay(1000)
            isTypingLocally = false
            liveSocket.emit("typing", JSONObject().put("receiverId", partnerId).put("isTyping", false))
        }
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
                    emitEditMessage(updated)
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
                    socket?.emit(
                        "delete-message",
                        JSONObject().put("messageId", messageId).put("receiverId", partnerId),
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

    // Wraps Gson<->org.json conversion so a malformed round-trip can never
    // crash the caller - the REST call it follows already succeeded and
    // already updated local state, so a failed real-time relay just means
    // the other participant picks the same change up on their own next
    // 5-second poll instead, exactly like a dropped/offline socket would.
    private fun emitEditMessage(updated: ChatMessage) {
        val liveSocket = socket ?: return
        try {
            liveSocket.emit(
                "edit-message",
                JSONObject()
                    .put("message", JSONObject(gson.toJson(updated)))
                    .put("receiverId", partnerId),
            )
        } catch (e: Exception) {
            // Swallowed - see this function's own KDoc.
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
                    .put("receiverId", partnerId),
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
            repository.sendMessage(partnerId, content, replyToId)
                .onSuccess { message ->
                    _state.update {
                        it.copy(isSending = false, draft = "", replyingTo = null, messages = it.messages + message)
                    }
                    socket?.emit(
                        "send-message",
                        JSONObject()
                            .put("receiverId", partnerId)
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

    // Called once ConversationScreen's MediaRecorder has actually started -
    // mirrors ChatInterface.tsx's own setIsRecording(true)/
    // setRecordingSeconds(0) plus its setInterval ticking recordingSeconds
    // up every second.
    fun startRecordingTimer() {
        recordingTimerJob?.cancel()
        _state.update { it.copy(isRecording = true, recordingSeconds = 0) }
        recordingTimerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                _state.update { it.copy(recordingSeconds = it.recordingSeconds + 1) }
            }
        }
    }

    // Called after ConversationScreen has stopped/discarded the
    // MediaRecorder without sending - mirrors cancelRecording().
    fun cancelRecordingTimer() {
        recordingTimerJob?.cancel()
        recordingTimerJob = null
        _state.update { it.copy(isRecording = false, recordingSeconds = 0) }
    }

    /**
     * Mirrors ChatInterface.tsx's own recorder.onstop -> startAudioUpload
     * -> onClientUploadComplete -> sendMessage exactly - the real chatAudio
     * UploadThing router, the same "🎤 Voice message (m:ss)" content
     * prefix built from the elapsed recording time (ChatInterface.tsx's
     * own formatRecordingTime: no leading zero on minutes, seconds
     * zero-padded to 2 digits). Unlike onImagePicked/onVideoPicked/
     * onDocumentPicked there's no client-side size/type pre-check here,
     * matching web exactly - it uploads whatever MediaRecorder produced
     * and lets the real chatAudio router's own 8MB limit be the only
     * gate, surfaced through the same UploadFailed path on failure.
     */
    fun onVoiceRecorded(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        recordingTimerJob?.cancel()
        recordingTimerJob = null
        val durationSeconds = _state.value.recordingSeconds
        _state.update { it.copy(isRecording = false, recordingSeconds = 0) }

        val minutes = durationSeconds / 60
        val seconds = durationSeconds % 60
        val content = "🎤 Voice message (${minutes}:${seconds.toString().padStart(2, '0')})"

        _state.update { it.copy(isUploadingAttachment = true, attachmentUploadProgress = 0f, attachmentError = null, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "chatAudio",
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = { progress -> _state.update { it.copy(attachmentUploadProgress = progress) } },
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingAttachment = false) }
                sendAttachment(content, uploaded.url)
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

    /**
     * Mirrors ChatInterface.tsx's own handleImageUpload exactly - same
     * 4MB cap, same JPEG/PNG/GIF/WebP allow-list, uploaded through the
     * same real chatImage UploadThing router - then immediately sent as
     * its own image-only message the moment the upload resolves,
     * matching web's own onClientUploadComplete -> sendMessage("", url).
     */
    fun onImagePicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        val validTypes = setOf("image/jpeg", "image/png", "image/gif", "image/webp")
        uploadAttachment(
            contentResolver = contentResolver,
            uri = uri,
            fileName = fileName,
            mimeType = mimeType,
            size = size,
            validTypes = validTypes,
            maxBytes = 4L * 1024 * 1024,
            maxMb = 4,
            slug = "chatImage",
            content = "",
        )
    }

    /**
     * Mirrors ChatInterface.tsx's own handleVideoUpload exactly - same
     * 32MB cap, same mp4/webm/quicktime/x-m4v allow-list, uploaded
     * through the same real chatVideo UploadThing router - then sent as
     * a "🎬 Video" message, the same content-prefix convention the real
     * POST /api/messages route relies on to tell attachment kinds apart
     * (there's no separate `type` field - see this ViewModel's own
     * MessageBubble rendering counterpart in ConversationScreen).
     */
    fun onVideoPicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        val validTypes = setOf("video/mp4", "video/webm", "video/quicktime", "video/x-m4v")
        uploadAttachment(
            contentResolver = contentResolver,
            uri = uri,
            fileName = fileName,
            mimeType = mimeType,
            size = size,
            validTypes = validTypes,
            maxBytes = 32L * 1024 * 1024,
            maxMb = 32,
            slug = "chatVideo",
            content = "🎬 Video",
        )
    }

    /**
     * Mirrors ChatInterface.tsx's own handleDocumentUpload exactly -
     * same 8MB cap, same pdf/msword/docx/xls/xlsx/ppt/pptx/plain-text
     * allow-list, uploaded through the same real chatFile UploadThing
     * router - then sent as a "📎 <filename>" message, matching web's
     * own content prefix exactly.
     */
    fun onDocumentPicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        val validTypes = setOf(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
        )
        uploadAttachment(
            contentResolver = contentResolver,
            uri = uri,
            fileName = fileName,
            mimeType = mimeType,
            size = size,
            validTypes = validTypes,
            maxBytes = 8L * 1024 * 1024,
            maxMb = 8,
            slug = "chatFile",
            content = "📎 $fileName",
        )
    }

    private fun uploadAttachment(
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
        validTypes: Set<String>,
        maxBytes: Long,
        maxMb: Int,
        slug: String,
        content: String,
    ) {
        if (mimeType !in validTypes) {
            _state.update { it.copy(attachmentError = ChatAttachmentError.InvalidType) }
            return
        }
        if (size > maxBytes) {
            _state.update { it.copy(attachmentError = ChatAttachmentError.FileTooLarge(maxMb)) }
            return
        }

        _state.update { it.copy(isUploadingAttachment = true, attachmentUploadProgress = 0f, attachmentError = null, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = slug,
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = { progress -> _state.update { it.copy(attachmentUploadProgress = progress) } },
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingAttachment = false) }
                sendAttachment(content, uploaded.url)
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

    private fun sendAttachment(content: String, imageUrl: String) {
        viewModelScope.launch {
            repository.sendMessage(receiverId = partnerId, content = content, imageUrl = imageUrl)
                .onSuccess { message ->
                    _state.update { it.copy(messages = it.messages + message) }
                    socket?.emit(
                        "send-message",
                        JSONObject()
                            .put("receiverId", partnerId)
                            .put("content", content)
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

    private fun load(isInitial: Boolean) {
        viewModelScope.launch {
            _state.update {
                if (isInitial) it.copy(isLoading = true, error = null) else it.copy(isRefreshing = true, error = null)
            }

            repository.getConversationMessages(partnerId)
                .onSuccess { list ->
                    val derivedPartner = list.firstNotNullOfOrNull { message ->
                        when (partnerId) {
                            message.sender?.id -> message.sender
                            message.receiver?.id -> message.receiver
                            else -> null
                        }
                    }
                    _state.update {
                        it.copy(
                            messages = list,
                            isLoading = false,
                            isRefreshing = false,
                            partner = derivedPartner ?: it.partner,
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
