package one.zrp.social.mobile.ui.liveaudio

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.LiveAudioRepository
import one.zrp.social.mobile.data.LiveRoomKind
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LiveAudioMuteChangedPayload
import one.zrp.social.mobile.network.LiveAudioParticipant
import one.zrp.social.mobile.network.LiveAudioParticipantRemovedPayload
import one.zrp.social.mobile.network.LiveAudioRoleChangedPayload
import one.zrp.social.mobile.network.LiveAudioRoom
import one.zrp.social.mobile.network.LiveAudioSpeakerRequestPayload
import one.zrp.social.mobile.network.ZrpSocket
import one.zrp.social.mobile.ui.live.LiveInteractionsController
import org.json.JSONObject

/** LISTENER < SPEAKER < MODERATOR ~= HOST - matches src/lib/live-audio/room-service.ts's own role checks (canPromoteSpeaker/isRoomAuthority). Exposed `internal` for LiveAudioRoomViewModelTest and reused by LiveAudioRoomScreen to group participants/gate action buttons. */
internal fun canPublishLiveAudio(role: String?): Boolean = role == "HOST" || role == "MODERATOR" || role == "SPEAKER"
internal fun isLiveAudioAuthority(role: String?): Boolean = role == "HOST" || role == "MODERATOR"

/** Pure append-if-absent, extracted from the `live-audio:speaker-request` handler for testability. */
internal fun addPendingSpeakerRequest(current: List<String>, userId: String): List<String> =
    if (current.contains(userId)) current else current + userId

/** Pure removal, extracted from the approve/reject-speak-request success path for testability. */
internal fun removePendingSpeakerRequest(current: List<String>, userId: String): List<String> =
    current.filterNot { it == userId }

// SCHEDULED: the room exists but its host hasn't started it - GET
// /rooms/{id} works, POST /join would fail with room_not_live, so the
// screen shows the scheduled state (reminder / host start) instead.
// ENDED also covers a room that was already ENDED/CANCELLED when opened.
enum class LiveAudioPhase { LOADING, CONNECTING, CONNECTED, SCHEDULED, ENDED, REMOVED, ERROR }

data class LiveAudioRoomUiState(
    val phase: LiveAudioPhase = LiveAudioPhase.LOADING,
    val room: LiveAudioRoom? = null,
    val participants: List<LiveAudioParticipant> = emptyList(),
    val myRole: String? = null,
    val myUserId: String? = null,
    val isMicOn: Boolean = false,
    val isMicBusy: Boolean = false,
    val speakingUserIds: Set<String> = emptySet(),
    // Only ever populated from `live-audio:speak-request` events heard
    // WHILE this screen is open (see GET /rooms/{id}'s own
    // pendingRequestCount KDoc in LiveAudioApi.kt) - a host/moderator who
    // opens a room that already had requests queued before they joined
    // sees the count on the room card but not the individual ids until a
    // new one arrives or an existing requester's presence changes,
    // matching page.tsx's own pendingRequesterIds exactly (it has the
    // same gap).
    val pendingSpeakerRequestUserIds: List<String> = emptyList(),
    val speakRequestSent: Boolean = false,
    val actionBusyUserId: String? = null,
    val error: String? = null,
    val actionError: String? = null,
    // Host start/cancel of a SCHEDULED room.
    val scheduledActionBusy: Boolean = false,
    val scheduledActionError: String? = null,
)

/**
 * ZRP Live Audio's room screen - ported from src/app/live-audio/[id]/
 * page.tsx. Room/participant state (who's in the room, roles, mutes) is
 * carried entirely by the existing Socket.IO `live-audio:*` events
 * (server.js / src/lib/live-audio/room-service.ts) layered on top of a
 * plain REST detail re-fetch on every event; the LiveKit Room connection
 * underneath is purely the audio transport (publishing/hearing tracks)
 * and is never consulted for "who is in this room" - that would race
 * the DB-backed truth those events already carry.
 *
 * Mirrors page.tsx's own reconnectWithFreshToken(): a role change never
 * mutates permissions on an existing LiveKit token (those are baked in
 * at mint time server-side - see mintLiveKitToken), so a role-changed
 * event naming this user re-fetches a token for the new role and
 * reconnects the SAME Room instance to pick it up, rather than a full
 * teardown/rebuild.
 *
 * Also matches page.tsx exactly in one deliberate way: joining a room
 * never auto-enables the microphone for anyone, including the host -
 * every participant, whatever their role, starts muted (isMicOn=false)
 * and must tap unmute themselves. Audio *output* routing (speaker/
 * earpiece/Bluetooth, and the AudioManager MODE_IN_COMMUNICATION switch
 * a raw WebRTC track would otherwise need - see CallViewModel's own
 * setupCallAudio KDoc) is handled automatically by the LiveKit SDK's
 * built-in AudioSwitchHandler; this class does not duplicate that.
 *
 * Unlike ConversationViewModel/CallViewModel, the real-time-only-while-
 * connected REST leave call is NOT attempted from onCleared(): the
 * ViewModel's own viewModelScope is already cancelled by the time
 * onCleared() runs (ViewModel.clear() closes it before invoking
 * onCleared()), so a suspend network call started there would never
 * actually complete. onCleared() therefore only does the synchronous
 * local teardown (drop the socket listeners, disconnect Room); the real
 * POST /leave call is made by the explicit leave() below, which the
 * screen calls (still inside an active viewModelScope) before it
 * navigates away. An abrupt process death or a bare system back with no
 * explicit leave() therefore leaves the server-side participant row to
 * be reaped by the same staleness cleanup the architecture doc already
 * documents for a closed browser tab - a real, honest gap shared with
 * web's own best-effort `keepalive` fetch (which is likewise not
 * guaranteed to complete), not a regression introduced here.
 */
class LiveAudioRoomViewModel(
    private val roomId: String,
    private val repository: LiveAudioRepository = LiveAudioRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(LiveAudioRoomUiState())
    val state: StateFlow<LiveAudioRoomUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private var livekitRoom: Room? = null
    private var joinedSuccessfully = false

    /**
     * Gifts, chat, reactions, recording and reminders for this room -
     * see LiveInteractionsController's KDoc. Shares this screen's socket
     * (attached in connectSocket) rather than opening a second one.
     */
    val interactions = LiveInteractionsController(
        kind = LiveRoomKind.AUDIO,
        roomId = roomId,
        scope = viewModelScope,
        onUnknownUser = { loadDetail() },
        onRoomStateStale = { loadDetail() },
    )

    init {
        loadDetail()
    }

    private fun loadDetail() {
        viewModelScope.launch {
            repository.getRoom(roomId)
                .onSuccess { detail ->
                    interactions.updateKnownUsers(detail.participants.map { it.user })
                    interactions.seedFromRoom(detail.room.slowModeSeconds, detail.room.reactionCount)
                    _state.update { current ->
                        current.copy(
                            room = detail.room,
                            participants = detail.participants,
                            myRole = detail.myRole,
                            // A scheduled room whose host just started it (seen
                            // on a re-read) leaves the scheduled state; the
                            // screen then calls connect() to actually join.
                            phase = if (current.phase == LiveAudioPhase.SCHEDULED && detail.room.status != "SCHEDULED") {
                                if (detail.room.status == "LIVE") LiveAudioPhase.LOADING else LiveAudioPhase.ENDED
                            } else {
                                current.phase
                            },
                            pendingSpeakerRequestUserIds = removePendingSpeakerRequest(
                                current.pendingSpeakerRequestUserIds,
                                current.myUserId ?: "",
                            ),
                        )
                    }
                }
                .onFailure { error ->
                    // Only a failure on the very first load is fatal to the
                    // screen - a transient failure on a later re-fetch
                    // (triggered by some other participant's event) simply
                    // leaves the last-known-good list on screen, matching
                    // page.tsx's own setLoadError only ever being set from
                    // the initial loadDetail() call site.
                    if (_state.value.phase == LiveAudioPhase.LOADING) {
                        _state.update { it.copy(phase = LiveAudioPhase.ERROR, error = error.message) }
                    }
                }
        }
    }

    /** [context] is only used to construct the LiveKit Room (application context, never retained beyond this call). */
    fun connect(context: Context) {
        if (livekitRoom != null || _state.value.phase == LiveAudioPhase.CONNECTING) return
        _state.update { it.copy(phase = LiveAudioPhase.CONNECTING, error = null) }

        viewModelScope.launch {
            val ownUserId = repository.getOwnUserId().getOrNull()
            _state.update { it.copy(myUserId = ownUserId) }
            interactions.setMyUserId(ownUserId)

            // Only a LIVE room can be joined. A SCHEDULED one gets its own
            // screen state (reminder / host start), and an ENDED/CANCELLED
            // one goes straight to the ended state with its replays -
            // instead of both dead-ending on a join error. If this read
            // itself fails, fall through to the join exactly as before so
            // the join's own (more specific) error is what surfaces.
            val preJoin = repository.getRoom(roomId).getOrNull()
            if (preJoin != null && preJoin.room.status != "LIVE") {
                interactions.updateKnownUsers(preJoin.participants.map { it.user })
                _state.update {
                    it.copy(
                        room = preJoin.room,
                        participants = preJoin.participants,
                        myRole = preJoin.myRole,
                        phase = if (preJoin.room.status == "SCHEDULED") LiveAudioPhase.SCHEDULED else LiveAudioPhase.ENDED,
                    )
                }
                return@launch
            }

            repository.joinRoom(roomId)
                .onSuccess { join ->
                    try {
                        val room = LiveKit.create(context.applicationContext)
                        livekitRoom = room
                        observeRoomEvents(room)
                        room.connect(join.livekitUrl, join.token)
                        joinedSuccessfully = true
                        _state.update { it.copy(phase = LiveAudioPhase.CONNECTED, myRole = join.participant.role) }
                        connectSocket(ownUserId)
                        loadDetail()
                        interactions.loadChatHistory()
                        // Loaded eagerly (one small GET) so every viewer's gift
                        // animation can show the real icon, not only after
                        // they open the panel themselves.
                        interactions.loadCatalog()
                    } catch (e: Exception) {
                        livekitRoom?.disconnect()
                        livekitRoom = null
                        _state.update { it.copy(phase = LiveAudioPhase.ERROR, error = e.message) }
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(phase = LiveAudioPhase.ERROR, error = error.message) }
                }
        }
    }

    private fun observeRoomEvents(room: Room) {
        viewModelScope.launch {
            room.events.collect { event ->
                if (event is RoomEvent.ActiveSpeakersChanged) {
                    val speakingIds = event.speakers.mapNotNull { it.identity?.value }.toSet()
                    _state.update { it.copy(speakingUserIds = speakingIds) }
                }
            }
        }
    }

    private fun connectSocket(ownUserId: String?) {
        if (socket != null) return
        val liveSocket = ZrpSocket.connect(ApiClient.getTokenStore())
        socket = liveSocket

        liveSocket.on("live-audio:participant-joined", Emitter.Listener { loadDetail() })
        liveSocket.on("live-audio:participant-left", Emitter.Listener { loadDetail() })

        liveSocket.on("live-audio:participant-removed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioParticipantRemovedPayload::class.java) ?: return@Listener
            // My own removal is handled by the dedicated you-were-removed
            // event below, which also carries the terminal-state signal
            // participant-removed does not.
            if (payload.userId != ownUserId) loadDetail()
        })

        liveSocket.on("live-audio:role-changed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioRoleChangedPayload::class.java) ?: return@Listener
            loadDetail()
            if (payload.userId == ownUserId) reconnectWithFreshToken()
        })

        liveSocket.on("live-audio:mute-changed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioMuteChangedPayload::class.java) ?: return@Listener
            loadDetail()
            if (payload.userId == ownUserId && payload.isMuted) {
                viewModelScope.launch {
                    runCatching { livekitRoom?.localParticipant?.setMicrophoneEnabled(false) }
                }
                _state.update { it.copy(isMicOn = false) }
            }
        })

        liveSocket.on("live-audio:room-ended", Emitter.Listener {
            _state.update { it.copy(phase = LiveAudioPhase.ENDED, room = it.room?.copy(status = "ENDED")) }
            livekitRoom?.disconnect()
        })

        liveSocket.on("live-audio:you-were-removed", Emitter.Listener {
            _state.update { it.copy(phase = LiveAudioPhase.REMOVED) }
            livekitRoom?.disconnect()
        })

        liveSocket.on("live-audio:speaker-request", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioSpeakerRequestPayload::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(
                    pendingSpeakerRequestUserIds = addPendingSpeakerRequest(current.pendingSpeakerRequestUserIds, payload.userId),
                )
            }
        })

        interactions.attach(liveSocket)

        // A Socket.IO reconnect (reconnection=true) gets a brand-new
        // server-side socket with no room memberships - re-join on every
        // (re)connect so chat/gift/reaction broadcasts resume after a
        // network blip. The first connect's join is the buffered emit
        // below; a duplicate join is a no-op server-side.
        liveSocket.on(Socket.EVENT_CONNECT, Emitter.Listener { liveSocket.emit("join-live-audio-room", roomId) })

        liveSocket.emit("join-live-audio-room", roomId)
    }

    private fun reconnectWithFreshToken() {
        viewModelScope.launch {
            val room = livekitRoom ?: return@launch
            repository.refreshToken(roomId).onSuccess { token ->
                // Best-effort, matching page.tsx's own reconnectWithFreshToken:
                // on failure the room simply stays connected on its previous
                // grants until the next natural reconnect picks up the new
                // token.
                runCatching { room.connect(token.livekitUrl, token.token) }
            }
        }
    }

    private fun <T> parsePayload(args: Array<out Any>, type: Class<T>): T? {
        val json = args.getOrNull(0) as? JSONObject ?: return null
        return try {
            gson.fromJson(json.toString(), type)
        } catch (e: Exception) {
            null
        }
    }

    fun toggleMic() {
        val room = livekitRoom ?: return
        if (_state.value.isMicBusy) return
        val turningOn = !_state.value.isMicOn
        _state.update { it.copy(isMicBusy = true) }
        viewModelScope.launch {
            // Permission denied or device unavailable both surface as a
            // thrown exception here (TrackException.PublishException, or a
            // bare SecurityException for a missing RECORD_AUDIO grant) -
            // caught so the toggle simply doesn't flip rather than crashing,
            // matching toggleMic's own try/catch on web.
            val ok = runCatching { room.localParticipant.setMicrophoneEnabled(turningOn) }.getOrDefault(false)
            _state.update { it.copy(isMicBusy = false, isMicOn = if (ok) turningOn else it.isMicOn) }
        }
    }

    fun requestToSpeak() {
        viewModelScope.launch {
            repository.requestToSpeak(roomId)
                .onSuccess { _state.update { it.copy(speakRequestSent = true) } }
                .onFailure { error -> _state.update { it.copy(actionError = error.message) } }
        }
    }

    fun resolveSpeakRequest(userId: String, approve: Boolean) {
        _state.update { it.copy(actionBusyUserId = userId) }
        viewModelScope.launch {
            val result = if (approve) repository.approveSpeakRequest(roomId, userId) else repository.rejectSpeakRequest(roomId, userId)
            result
                .onSuccess {
                    _state.update { current ->
                        current.copy(
                            actionBusyUserId = null,
                            pendingSpeakerRequestUserIds = removePendingSpeakerRequest(current.pendingSpeakerRequestUserIds, userId),
                        )
                    }
                    loadDetail()
                }
                .onFailure { error -> _state.update { it.copy(actionBusyUserId = null, actionError = error.message) } }
        }
    }

    fun promote(userId: String) = moderate(userId) { repository.promote(roomId, userId) }
    fun demote(userId: String) = moderate(userId) { repository.demote(roomId, userId) }
    fun mute(userId: String) = moderate(userId) { repository.mute(roomId, userId, muted = true) }
    fun unmute(userId: String) = moderate(userId) { repository.mute(roomId, userId, muted = false) }
    fun remove(userId: String) = moderate(userId) { repository.remove(roomId, userId) }

    private fun moderate(userId: String, action: suspend () -> Result<*>) {
        _state.update { it.copy(actionBusyUserId = userId) }
        viewModelScope.launch {
            action()
                .onSuccess {
                    _state.update { it.copy(actionBusyUserId = null) }
                    loadDetail()
                }
                .onFailure { error -> _state.update { it.copy(actionBusyUserId = null, actionError = error.message) } }
        }
    }

    fun dismissActionError() {
        _state.update { it.copy(actionError = null) }
    }

    /** Host starts their SCHEDULED room now; on success the screen joins it like any live room. */
    fun startScheduledRoom(context: Context) {
        if (_state.value.scheduledActionBusy) return
        _state.update { it.copy(scheduledActionBusy = true, scheduledActionError = null) }
        viewModelScope.launch {
            repository.startRoom(roomId)
                .onSuccess { response ->
                    _state.update { it.copy(scheduledActionBusy = false, room = response.room, phase = LiveAudioPhase.LOADING) }
                    connect(context)
                }
                .onFailure { error -> _state.update { it.copy(scheduledActionBusy = false, scheduledActionError = error.message) } }
        }
    }

    fun cancelScheduledRoom() {
        if (_state.value.scheduledActionBusy) return
        _state.update { it.copy(scheduledActionBusy = true, scheduledActionError = null) }
        viewModelScope.launch {
            repository.cancelRoom(roomId)
                .onSuccess {
                    _state.update { it.copy(scheduledActionBusy = false, room = it.room?.copy(status = "CANCELLED"), phase = LiveAudioPhase.ENDED) }
                }
                .onFailure { error -> _state.update { it.copy(scheduledActionBusy = false, scheduledActionError = error.message) } }
        }
    }

    /** Re-checks a SCHEDULED room (e.g. after the reminder notification) and joins if it has gone live. */
    fun recheckScheduledRoom(context: Context) {
        if (_state.value.phase != LiveAudioPhase.SCHEDULED) return
        _state.update { it.copy(phase = LiveAudioPhase.LOADING) }
        connect(context)
    }

    fun endRoom() {
        viewModelScope.launch {
            repository.endRoom(roomId).onFailure { error -> _state.update { it.copy(actionError = error.message) } }
        }
    }

    /** Called by the screen (still on an active viewModelScope) before it navigates away - see this class's own KDoc for why this, not onCleared(), makes the real POST /leave call. */
    fun leave() {
        viewModelScope.launch {
            if (joinedSuccessfully) repository.leaveRoom(roomId)
        }
        teardownLocal()
    }

    private fun teardownLocal() {
        socket?.let { liveSocket ->
            liveSocket.off("live-audio:participant-joined")
            liveSocket.off("live-audio:participant-left")
            liveSocket.off("live-audio:participant-removed")
            liveSocket.off("live-audio:role-changed")
            liveSocket.off("live-audio:mute-changed")
            liveSocket.off("live-audio:room-ended")
            liveSocket.off("live-audio:you-were-removed")
            liveSocket.off("live-audio:speaker-request")
            liveSocket.off(Socket.EVENT_CONNECT)
            interactions.detach(liveSocket)
            if (joinedSuccessfully) liveSocket.emit("leave-live-audio-room", roomId)
            liveSocket.disconnect()
        }
        socket = null
        livekitRoom?.disconnect()
        livekitRoom = null
        joinedSuccessfully = false
        interactions.cancelPendingWork()
    }

    override fun onCleared() {
        teardownLocal()
    }
}

class LiveAudioRoomViewModelFactory(private val roomId: String) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LiveAudioRoomViewModel(roomId) as T
}
