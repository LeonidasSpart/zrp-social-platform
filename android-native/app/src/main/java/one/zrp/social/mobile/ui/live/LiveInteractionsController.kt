package one.zrp.social.mobile.ui.live

import com.google.gson.Gson
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.LiveApiException
import one.zrp.social.mobile.data.LiveInteractionsRepository
import one.zrp.social.mobile.data.LiveRoomKind
import one.zrp.social.mobile.network.LiveAudioHost
import one.zrp.social.mobile.network.LiveChatAuthor
import one.zrp.social.mobile.network.LiveChatMessageDeletedPayload
import one.zrp.social.mobile.network.LiveChatMessagePayload
import one.zrp.social.mobile.network.LiveChatMuteChangedPayload
import one.zrp.social.mobile.network.LiveChatSlowModeChangedPayload
import one.zrp.social.mobile.network.LiveGift
import one.zrp.social.mobile.network.LiveGiftSentPayload
import one.zrp.social.mobile.network.LiveReactionTapPayload
import one.zrp.social.mobile.network.LiveRecording
import one.zrp.social.mobile.network.LiveRecordingStartedPayload
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

data class LiveChatState(
    // Newest first; rendered with reverseLayout so the newest sits at the bottom.
    val messages: List<LiveChatEntry> = emptyList(),
    // Every user this screen can put a name/avatar to: the room's
    // participant list (refreshed by the owning ViewModel) plus history
    // authors. A `live-chat:message` payload carries only authorId.
    val authors: Map<String, LiveChatAuthor> = emptyMap(),
    val historyLoaded: Boolean = false,
    val historyError: LiveApiException? = null,
    val nextCursor: String? = null,
    val loadingOlder: Boolean = false,
    val sending: Boolean = false,
    val sendError: LiveApiException? = null,
    val cooldownUntilMillis: Long = 0L,
    val slowModeSeconds: Int = 0,
    // Learned only from my own chat_muted rejection or a
    // `live-chat:mute-changed` naming me - GET /rooms/{id} does not
    // expose isChatMuted, so a mute applied before this screen opened is
    // discovered on the first send attempt.
    val myChatMuted: Boolean = false,
    // Chat-mute state per user, as observed on this screen (same gap as
    // above - only users whose state changed while this screen was open
    // are known; everyone else is treated as "not known to be muted").
    val knownChatMute: Map<String, Boolean> = emptyMap(),
    val actionBusyMessageId: String? = null,
    val actionError: LiveApiException? = null,
)

data class LiveReactionBurst(val localId: Long, val count: Int, val mine: Boolean)

data class LiveReactionState(
    val roomReactionCount: Int = 0,
    val bursts: List<LiveReactionBurst> = emptyList(),
)

data class LiveGiftState(
    val catalog: List<LiveGift> = emptyList(),
    val catalogLoading: Boolean = false,
    val catalogLoaded: Boolean = false,
    val catalogError: LiveApiException? = null,
    val balance: Int? = null,
    val balanceLoading: Boolean = false,
    val balanceError: LiveApiException? = null,
    val sending: Boolean = false,
    val sendError: LiveApiException? = null,
    // Bumped once per server-CONFIRMED send (a 200, or a
    // duplicate_transaction for a retried key - both mean the charge
    // committed). The panel closes and confirms only off this, never
    // before the server answers.
    val confirmedSendCount: Int = 0,
    // Head = currently animating. Fed only by `live-gift:sent`.
    val animationQueue: List<LiveGiftEvent> = emptyList(),
)

data class LiveRecordingState(
    // Learned from my own start/stop responses and the
    // `live-replay:recording-started` broadcast. GET /rooms/{id} does not
    // expose "is this room recording right now", and the server
    // broadcasts no "stopped" event, so a viewer who joined mid-recording
    // (or after another moderator stopped it) can't know - documented
    // backend gap, not guessed at here.
    val isRecording: Boolean = false,
    val busy: Boolean = false,
    // Sticky once the server says replay_not_configured, so the control
    // reads "Recording isn't available yet" instead of inviting retries.
    val unavailable: Boolean = false,
    val error: LiveApiException? = null,
    val replays: List<LiveRecording> = emptyList(),
    val replaysLoading: Boolean = false,
    val replaysLoaded: Boolean = false,
    val replaysError: LiveApiException? = null,
    val deletingReplayId: String? = null,
)

/**
 * "Remind me" for a SCHEDULED room. [isSet] reflects only what THIS
 * device did this session: the backend has hasReminder() but no route
 * exposes it, so a reminder set earlier (or on web) can't be shown as
 * already-on - re-tapping is harmless (POST is idempotent server-side).
 */
data class LiveReminderState(
    val isSet: Boolean = false,
    val busy: Boolean = false,
    val error: LiveApiException? = null,
)

/**
 * Gifts, chat, reactions and recording for ONE live room - shared by
 * LiveAudioRoomViewModel and LiveVideoRoomViewModel so the two room
 * kinds can't drift apart. Owned by (and scoped to) the room
 * ViewModel's viewModelScope; it never opens its own socket - it
 * attaches listeners to the room screen's existing Socket.IO connection,
 * whose per-room channel (`join-live-audio-room`/`join-live-video-room`)
 * already carries every `live-chat:*`, `live-gift:sent`,
 * `live-reaction:tap` and `live-replay:*` broadcast (socket-emit.ts's
 * emitToLiveAudioRoom/emitToLiveVideoRoom).
 *
 * Server authority is never second-guessed: a gift animation only ever
 * plays from the server's `live-gift:sent` broadcast (sent strictly
 * after the debit commits), a chat message only ever appears after the
 * server accepted it, and a sent-gift confirmation only after a 200.
 */
class LiveInteractionsController(
    private val kind: LiveRoomKind,
    private val roomId: String,
    private val scope: CoroutineScope,
    private val repository: LiveInteractionsRepository = LiveInteractionsRepository(),
    // Called when a chat/gift event names a user this screen can't put a
    // name to yet - the owning ViewModel re-fetches the participant list
    // (the sender is always an active participant server-side).
    private val onUnknownUser: () -> Unit = {},
    // Called when the server says the room's lifecycle moved on under us
    // (a reminder on a room that already started) - the owning ViewModel
    // re-reads the room so the screen leaves the scheduled state.
    private val onRoomStateStale: () -> Unit = {},
) {
    private val gson = Gson()
    private val localIds = AtomicLong(0)

    private val _chat = MutableStateFlow(LiveChatState())
    val chat: StateFlow<LiveChatState> = _chat.asStateFlow()

    private val _reactions = MutableStateFlow(LiveReactionState())
    val reactions: StateFlow<LiveReactionState> = _reactions.asStateFlow()

    private val _gifts = MutableStateFlow(LiveGiftState())
    val gifts: StateFlow<LiveGiftState> = _gifts.asStateFlow()

    private val _recording = MutableStateFlow(LiveRecordingState())
    val recording: StateFlow<LiveRecordingState> = _recording.asStateFlow()

    private val _reminder = MutableStateFlow(LiveReminderState())
    val reminder: StateFlow<LiveReminderState> = _reminder.asStateFlow()

    @Volatile
    private var myUserId: String? = null
    private val requestedUnknownUserIds = HashSet<String>()

    // Reaction batching - touched only from the main thread (UI taps and
    // viewModelScope coroutines), never from socket callbacks.
    private var pendingTaps = 0
    private var reactionPausedUntilMillis = 0L
    private var reactionFlushJob: Job? = null
    private var reactionInFlight = false

    // See resolveGiftAttempt's KDoc - only set while an attempt's outcome is unknown.
    private var unresolvedGiftAttempt: LiveGiftAttempt? = null

    fun setMyUserId(userId: String?) {
        myUserId = userId
    }

    /** Seeds per-room values from GET /rooms/{id}'s room row. */
    fun seedFromRoom(slowModeSeconds: Int, reactionCount: Int) {
        _chat.update { it.copy(slowModeSeconds = slowModeSeconds) }
        _reactions.update { it.copy(roomReactionCount = maxOf(it.roomReactionCount, reactionCount)) }
    }

    /** Feeds the room's current participant list in as known chat/gift authors. */
    fun updateKnownUsers(users: List<LiveAudioHost>) {
        if (users.isEmpty()) return
        _chat.update { current ->
            val merged = current.authors.toMutableMap()
            users.forEach { merged[it.id] = LiveChatAuthor(it.id, it.username, it.name, it.avatarUrl) }
            current.copy(authors = merged)
        }
    }

    private fun noteUserSeen(userId: String) {
        if (_chat.value.authors.containsKey(userId)) return
        val shouldRequest = synchronized(requestedUnknownUserIds) { requestedUnknownUserIds.add(userId) }
        if (shouldRequest) onUnknownUser()
    }

    // ─── Socket ──────────────────────────────────────────────────────

    fun attach(socket: Socket) {
        socket.on(EVENT_CHAT_MESSAGE, Emitter.Listener { args ->
            val payload = parse(args, LiveChatMessagePayload::class.java) ?: return@Listener
            _chat.update { it.copy(messages = prependChatMessage(it.messages, LiveChatEntry(payload.id, payload.authorId, payload.body, payload.createdAt))) }
            noteUserSeen(payload.authorId)
        })
        socket.on(EVENT_CHAT_DELETED, Emitter.Listener { args ->
            val payload = parse(args, LiveChatMessageDeletedPayload::class.java) ?: return@Listener
            _chat.update { it.copy(messages = removeChatMessage(it.messages, payload.id)) }
        })
        socket.on(EVENT_CHAT_MUTE_CHANGED, Emitter.Listener { args ->
            val payload = parse(args, LiveChatMuteChangedPayload::class.java) ?: return@Listener
            _chat.update { current ->
                current.copy(
                    knownChatMute = current.knownChatMute + (payload.userId to payload.isChatMuted),
                    myChatMuted = if (payload.userId == myUserId) payload.isChatMuted else current.myChatMuted,
                    sendError = if (payload.userId == myUserId && !payload.isChatMuted) null else current.sendError,
                )
            }
        })
        socket.on(EVENT_CHAT_SLOW_MODE, Emitter.Listener { args ->
            val payload = parse(args, LiveChatSlowModeChangedPayload::class.java) ?: return@Listener
            _chat.update {
                it.copy(
                    slowModeSeconds = payload.seconds,
                    cooldownUntilMillis = if (payload.seconds == 0) 0L else it.cooldownUntilMillis,
                )
            }
        })
        socket.on(EVENT_GIFT_SENT, Emitter.Listener { args ->
            val payload = parse(args, LiveGiftSentPayload::class.java) ?: return@Listener
            val event = LiveGiftEvent(
                localId = localIds.incrementAndGet(),
                transactionIds = listOf(payload.transactionId),
                senderId = payload.senderId,
                giftKey = payload.giftKey,
                quantity = payload.quantity,
                totalCoins = payload.totalCoins,
            )
            _gifts.update { it.copy(animationQueue = enqueueGiftEvent(it.animationQueue, event)) }
            noteUserSeen(payload.senderId)
        })
        socket.on(EVENT_REACTION_TAP, Emitter.Listener { args ->
            val payload = parse(args, LiveReactionTapPayload::class.java) ?: return@Listener
            val mine = payload.userId == myUserId
            _reactions.update { current ->
                current.copy(
                    roomReactionCount = maxOf(current.roomReactionCount, payload.roomReactionCount),
                    // My own taps were already animated locally the moment
                    // they happened - the echo only updates the total.
                    bursts = if (mine) current.bursts else addBurst(current.bursts, payload.count, mine = false),
                )
            }
        })
        socket.on(EVENT_RECORDING_STARTED, Emitter.Listener { args ->
            parse(args, LiveRecordingStartedPayload::class.java) ?: return@Listener
            _recording.update { it.copy(isRecording = true, unavailable = false) }
        })
    }

    fun detach(socket: Socket) {
        ALL_EVENTS.forEach { socket.off(it) }
    }

    private fun <T> parse(args: Array<out Any>, type: Class<T>): T? {
        val json = args.getOrNull(0) as? JSONObject ?: return null
        return try {
            gson.fromJson(json.toString(), type)
        } catch (e: Exception) {
            null
        }
    }

    // ─── Chat ────────────────────────────────────────────────────────

    fun loadChatHistory() {
        if (_chat.value.historyLoaded) return
        scope.launch {
            repository.getChat(kind, roomId, cursor = null, limit = CHAT_PAGE_SIZE)
                .onSuccess { page ->
                    _chat.update { current ->
                        val authors = current.authors.toMutableMap()
                        page.messages.forEach { authors.putIfAbsent(it.author.id, it.author) }
                        val history = page.messages.map { LiveChatEntry(it.id, it.author.id, it.body, it.createdAt) }
                        current.copy(
                            // Socket messages that arrived while this loaded are newer than any history row.
                            messages = appendOlderChatMessages(current.messages, history),
                            authors = authors,
                            nextCursor = page.nextCursor,
                            historyLoaded = true,
                            historyError = null,
                        )
                    }
                }
                .onFailure { error -> _chat.update { it.copy(historyError = error.asLive()) } }
        }
    }

    fun loadOlderChat() {
        val current = _chat.value
        val cursor = current.nextCursor ?: return
        if (current.loadingOlder) return
        _chat.update { it.copy(loadingOlder = true) }
        scope.launch {
            repository.getChat(kind, roomId, cursor = cursor, limit = CHAT_PAGE_SIZE)
                .onSuccess { page ->
                    _chat.update { s ->
                        val authors = s.authors.toMutableMap()
                        page.messages.forEach { authors.putIfAbsent(it.author.id, it.author) }
                        s.copy(
                            messages = appendOlderChatMessages(s.messages, page.messages.map { LiveChatEntry(it.id, it.author.id, it.body, it.createdAt) }),
                            authors = authors,
                            nextCursor = page.nextCursor,
                            loadingOlder = false,
                        )
                    }
                }
                .onFailure { _chat.update { it.copy(loadingOlder = false) } }
        }
    }

    /** [onSent] runs only after the server accepted the message, so the composer clears only then. */
    fun sendChat(rawBody: String, onSent: () -> Unit) {
        val body = rawBody.trim()
        val current = _chat.value
        if (body.isEmpty() || current.sending || current.myChatMuted) return
        if (body.length > LIVE_CHAT_MAX_LENGTH) return
        if (cooldownRemainingSeconds(System.currentTimeMillis(), current.cooldownUntilMillis) > 0) return

        _chat.update { it.copy(sending = true, sendError = null) }
        scope.launch {
            repository.sendChat(kind, roomId, body)
                .onSuccess { response ->
                    val msg = response.message
                    _chat.update { s ->
                        s.copy(
                            sending = false,
                            messages = prependChatMessage(s.messages, LiveChatEntry(msg.id, msg.authorId, msg.body, msg.createdAt)),
                            cooldownUntilMillis = if (s.slowModeSeconds > 0) System.currentTimeMillis() + s.slowModeSeconds * 1000L else 0L,
                        )
                    }
                    onSent()
                }
                .onFailure { error ->
                    val live = error.asLive()
                    _chat.update { s ->
                        when (live.code) {
                            "slow_mode", LiveApiException.CODE_RATE_LIMITED -> s.copy(
                                sending = false,
                                cooldownUntilMillis = System.currentTimeMillis() + (live.retryAfterSeconds ?: maxOf(s.slowModeSeconds, 5)) * 1000L,
                                sendError = live,
                            )
                            "chat_muted" -> s.copy(sending = false, myChatMuted = true, sendError = live)
                            else -> s.copy(sending = false, sendError = live)
                        }
                    }
                }
        }
    }

    fun dismissChatSendError() {
        _chat.update { it.copy(sendError = null) }
    }

    fun deleteChatMessage(messageId: String) {
        _chat.update { it.copy(actionBusyMessageId = messageId, actionError = null) }
        scope.launch {
            repository.deleteChat(kind, roomId, messageId)
                .onSuccess { _chat.update { it.copy(actionBusyMessageId = null, messages = removeChatMessage(it.messages, messageId)) } }
                .onFailure { error -> _chat.update { it.copy(actionBusyMessageId = null, actionError = error.asLive()) } }
        }
    }

    fun setUserChatMuted(userId: String, muted: Boolean) {
        _chat.update { it.copy(actionError = null) }
        scope.launch {
            repository.setChatMute(kind, roomId, userId, muted)
                .onSuccess { _chat.update { it.copy(knownChatMute = it.knownChatMute + (userId to muted)) } }
                .onFailure { error -> _chat.update { it.copy(actionError = error.asLive()) } }
        }
    }

    fun setSlowMode(seconds: Int) {
        _chat.update { it.copy(actionError = null) }
        scope.launch {
            repository.setSlowMode(kind, roomId, seconds)
                .onSuccess { _chat.update { it.copy(slowModeSeconds = seconds) } }
                .onFailure { error -> _chat.update { it.copy(actionError = error.asLive()) } }
        }
    }

    fun dismissChatActionError() {
        _chat.update { it.copy(actionError = null) }
    }

    // ─── Reactions ───────────────────────────────────────────────────

    /**
     * One tap. Animated locally at once (the server's echo of my own taps
     * is then ignored for animation), batched into one POST with a count,
     * and silently dropped while a rate_limited back-off is active.
     */
    fun tapReaction() {
        if (isReactionPaused(System.currentTimeMillis(), reactionPausedUntilMillis)) return
        // Never queue more than a few requests' worth while one is in
        // flight - the server allows 60 taps per 10s per user anyway.
        if (pendingTaps >= LIVE_REACTION_MAX_PER_REQUEST * 3) return
        pendingTaps += 1
        _reactions.update { it.copy(bursts = addBurst(it.bursts, 1, mine = true)) }
        if (pendingTaps >= LIVE_REACTION_MAX_PER_REQUEST) {
            reactionFlushJob?.cancel()
            reactionFlushJob = null
            flushReactions()
        } else if (reactionFlushJob == null) {
            reactionFlushJob = scope.launch {
                delay(REACTION_BATCH_WINDOW_MILLIS)
                reactionFlushJob = null
                flushReactions()
            }
        }
    }

    private fun flushReactions() {
        if (reactionInFlight) return
        val (send, remaining) = nextReactionBatch(pendingTaps)
        if (send == 0) return
        pendingTaps = remaining
        reactionInFlight = true
        scope.launch {
            repository.sendReaction(kind, roomId, send)
                .onSuccess { response ->
                    _reactions.update { it.copy(roomReactionCount = maxOf(it.roomReactionCount, response.roomReactionCount)) }
                }
                .onFailure { error ->
                    // Never an error toast for a casual tap: a rate limit just
                    // pauses local tapping until it recovers; anything else
                    // (room ended, not a participant, network) drops the batch
                    // - the room's own lifecycle events handle those states.
                    val live = error.asLive()
                    if (live.code == LiveApiException.CODE_RATE_LIMITED) {
                        reactionPausedUntilMillis = System.currentTimeMillis() + (live.retryAfterSeconds ?: 5) * 1000L
                    }
                    pendingTaps = 0
                }
            reactionInFlight = false
            if (pendingTaps > 0 && reactionFlushJob == null) {
                reactionFlushJob = scope.launch {
                    delay(REACTION_BATCH_WINDOW_MILLIS)
                    reactionFlushJob = null
                    flushReactions()
                }
            }
        }
    }

    private fun addBurst(bursts: List<LiveReactionBurst>, count: Int, mine: Boolean): List<LiveReactionBurst> =
        (bursts + LiveReactionBurst(localIds.incrementAndGet(), count, mine)).takeLast(LIVE_REACTION_MAX_BURSTS)

    fun consumeReactionBurst(localId: Long) {
        _reactions.update { current -> current.copy(bursts = current.bursts.filterNot { it.localId == localId }) }
    }

    // ─── Gifts ───────────────────────────────────────────────────────

    /** Called when the gift panel opens: catalog once, balance fresh every time. */
    fun openGiftPanel() {
        val current = _gifts.value
        _gifts.update { it.copy(sendError = null) }
        if (!current.catalogLoaded && !current.catalogLoading) loadCatalog()
        refreshBalance()
    }

    fun loadCatalog() {
        _gifts.update { it.copy(catalogLoading = true, catalogError = null) }
        scope.launch {
            repository.getGiftCatalog()
                .onSuccess { response ->
                    _gifts.update {
                        it.copy(
                            catalog = response.gifts.filter { gift -> gift.enabled }.sortedBy { gift -> gift.sortOrder },
                            catalogLoading = false,
                            catalogLoaded = true,
                        )
                    }
                }
                .onFailure { error -> _gifts.update { it.copy(catalogLoading = false, catalogError = error.asLive()) } }
        }
    }

    fun refreshBalance() {
        _gifts.update { it.copy(balanceLoading = true, balanceError = null) }
        scope.launch {
            repository.getCoinBalance()
                .onSuccess { response -> _gifts.update { it.copy(balance = response.balance, balanceLoading = false) } }
                .onFailure { error -> _gifts.update { it.copy(balanceLoading = false, balanceError = error.asLive()) } }
        }
    }

    fun sendGift(giftKey: String, quantity: Int) {
        if (_gifts.value.sending) return
        if (quantity < 1 || quantity > LIVE_GIFT_MAX_QUANTITY) return
        val attempt = resolveGiftAttempt(unresolvedGiftAttempt, giftKey, quantity) { UUID.randomUUID().toString() }
        unresolvedGiftAttempt = null
        _gifts.update { it.copy(sending = true, sendError = null) }
        scope.launch {
            repository.sendGift(kind, roomId, attempt.giftKey, attempt.quantity, attempt.idempotencyKey)
                .onSuccess { response ->
                    _gifts.update { s ->
                        s.copy(
                            sending = false,
                            balance = s.balance?.let { (it - response.gift.totalCoins).coerceAtLeast(0) },
                            confirmedSendCount = s.confirmedSendCount + 1,
                        )
                    }
                    refreshBalance()
                }
                .onFailure { error ->
                    val live = error.asLive()
                    when (live.code) {
                        // This exact key already committed - the earlier
                        // attempt whose response was lost DID go through.
                        "duplicate_transaction" -> {
                            _gifts.update { it.copy(sending = false, confirmedSendCount = it.confirmedSendCount + 1) }
                            refreshBalance()
                        }
                        LiveApiException.CODE_NETWORK -> {
                            // Outcome unknown: keep the key so a retry of the
                            // same gift can't charge twice.
                            unresolvedGiftAttempt = attempt
                            _gifts.update { it.copy(sending = false, sendError = live) }
                        }
                        "insufficient_balance" -> {
                            _gifts.update { it.copy(sending = false, sendError = live) }
                            refreshBalance()
                        }
                        "gift_disabled", "gift_not_found" -> {
                            _gifts.update { it.copy(sending = false, sendError = live, catalogLoaded = false) }
                            loadCatalog()
                        }
                        else -> _gifts.update { it.copy(sending = false, sendError = live) }
                    }
                }
        }
    }

    fun dismissGiftSendError() {
        _gifts.update { it.copy(sendError = null) }
    }

    fun consumeGiftAnimation(localId: Long) {
        _gifts.update { current ->
            current.copy(animationQueue = current.animationQueue.filterNot { it.localId == localId })
        }
    }

    // ─── Recording / replay ──────────────────────────────────────────

    fun startRecording() {
        if (_recording.value.busy) return
        _recording.update { it.copy(busy = true, error = null) }
        scope.launch {
            repository.startRecording(kind, roomId)
                .onSuccess { _recording.update { it.copy(busy = false, isRecording = true) } }
                .onFailure { error ->
                    val live = error.asLive()
                    _recording.update {
                        when (live.code) {
                            "replay_not_configured" -> it.copy(busy = false, unavailable = true, error = live)
                            "already_recording" -> it.copy(busy = false, isRecording = true)
                            else -> it.copy(busy = false, error = live)
                        }
                    }
                }
        }
    }

    fun stopRecording() {
        if (_recording.value.busy) return
        _recording.update { it.copy(busy = true, error = null) }
        scope.launch {
            repository.stopRecording(kind, roomId)
                .onSuccess { _recording.update { it.copy(busy = false, isRecording = false) } }
                .onFailure { error ->
                    val live = error.asLive()
                    _recording.update {
                        if (live.code == "not_recording") it.copy(busy = false, isRecording = false) else it.copy(busy = false, error = live)
                    }
                }
        }
    }

    fun dismissRecordingError() {
        _recording.update { it.copy(error = null) }
    }

    fun loadReplays() {
        if (_recording.value.replaysLoading) return
        _recording.update { it.copy(replaysLoading = true, replaysError = null) }
        scope.launch {
            repository.getReplays(kind, roomId)
                .onSuccess { response -> _recording.update { it.copy(replays = response.recordings, replaysLoading = false, replaysLoaded = true) } }
                .onFailure { error -> _recording.update { it.copy(replaysLoading = false, replaysError = error.asLive()) } }
        }
    }

    fun deleteReplay(recordingId: String) {
        _recording.update { it.copy(deletingReplayId = recordingId, replaysError = null) }
        scope.launch {
            repository.deleteRecording(kind, roomId, recordingId)
                .onSuccess {
                    _recording.update { s -> s.copy(deletingReplayId = null, replays = s.replays.filterNot { it.id == recordingId }) }
                }
                .onFailure { error -> _recording.update { it.copy(deletingReplayId = null, replaysError = error.asLive()) } }
        }
    }

    // ─── Scheduled-room reminders ───────────────────────────────────

    fun setReminder(enabled: Boolean) {
        if (_reminder.value.busy) return
        _reminder.update { it.copy(busy = true, error = null) }
        scope.launch {
            val result = if (enabled) repository.setReminder(kind, roomId) else repository.cancelReminder(kind, roomId)
            result
                .onSuccess { _reminder.update { it.copy(busy = false, isSet = enabled) } }
                .onFailure { error ->
                    val live = error.asLive()
                    _reminder.update { it.copy(busy = false, error = live) }
                    if (live.code == "not_scheduled") onRoomStateStale()
                }
        }
    }

    fun dismissReminderError() {
        _reminder.update { it.copy(error = null) }
    }

    /** Synchronous teardown for the owning ViewModel's leave()/onCleared(). */
    fun cancelPendingWork() {
        reactionFlushJob?.cancel()
        reactionFlushJob = null
        pendingTaps = 0
    }

    private fun Throwable.asLive(): LiveApiException =
        this as? LiveApiException ?: LiveApiException(LiveApiException.CODE_UNKNOWN, 0, message, null)

    companion object {
        const val EVENT_CHAT_MESSAGE = "live-chat:message"
        const val EVENT_CHAT_DELETED = "live-chat:message-deleted"
        const val EVENT_CHAT_MUTE_CHANGED = "live-chat:mute-changed"
        const val EVENT_CHAT_SLOW_MODE = "live-chat:slow-mode-changed"
        const val EVENT_GIFT_SENT = "live-gift:sent"
        const val EVENT_REACTION_TAP = "live-reaction:tap"
        const val EVENT_RECORDING_STARTED = "live-replay:recording-started"

        private val ALL_EVENTS = listOf(
            EVENT_CHAT_MESSAGE,
            EVENT_CHAT_DELETED,
            EVENT_CHAT_MUTE_CHANGED,
            EVENT_CHAT_SLOW_MODE,
            EVENT_GIFT_SENT,
            EVENT_REACTION_TAP,
            EVENT_RECORDING_STARTED,
        )

        private const val CHAT_PAGE_SIZE = 50
        private const val REACTION_BATCH_WINDOW_MILLIS = 400L
    }
}
