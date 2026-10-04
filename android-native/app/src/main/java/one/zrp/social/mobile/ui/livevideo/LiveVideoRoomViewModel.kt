package one.zrp.social.mobile.ui.livevideo

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.LiveRoomKind
import one.zrp.social.mobile.data.LiveVideoRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LiveAudioMuteChangedPayload
import one.zrp.social.mobile.network.LiveAudioParticipantRemovedPayload
import one.zrp.social.mobile.network.LiveAudioRoleChangedPayload
import one.zrp.social.mobile.network.LiveAudioRoom
import one.zrp.social.mobile.network.LiveAudioSpeakerRequestPayload
import one.zrp.social.mobile.network.LiveVideoCameraChangedPayload
import one.zrp.social.mobile.network.LiveVideoParticipant
import one.zrp.social.mobile.network.ZrpSocket
import one.zrp.social.mobile.ui.live.LiveInteractionsController
import one.zrp.social.mobile.ui.liveaudio.addPendingSpeakerRequest
import one.zrp.social.mobile.ui.liveaudio.canPublishLiveAudio
import one.zrp.social.mobile.ui.liveaudio.isLiveAudioAuthority
import one.zrp.social.mobile.ui.liveaudio.removePendingSpeakerRequest
import org.json.JSONObject

/** Same role ladder as Live Audio (LISTENER < SPEAKER < MODERATOR ~= HOST) - Live Video's room-service reuses canPromoteSpeaker/isRoomAuthority unchanged. */
internal fun canPublishLiveVideo(role: String?): Boolean = canPublishLiveAudio(role)
internal fun isLiveVideoAuthority(role: String?): Boolean = isLiveAudioAuthority(role)

/**
 * Who gets the big tile: the host while they're on camera-eligible
 * (they always are while present), otherwise the earliest remaining
 * publisher - so a stage never goes blank just because the host stepped
 * out for a moment. Pure for unit testing.
 */
internal fun pickStageUserId(participants: List<LiveVideoParticipant>, hostId: String?): String? {
    val publishers = participants.filter { canPublishLiveVideo(it.role) }
    return publishers.firstOrNull { it.user.id == hostId }?.user?.id ?: publishers.firstOrNull()?.user?.id
}

enum class LiveVideoPhase { LOADING, CONNECTING, CONNECTED, SCHEDULED, ENDED, REMOVED, ERROR }

data class LiveVideoRoomUiState(
    val phase: LiveVideoPhase = LiveVideoPhase.LOADING,
    val room: LiveAudioRoom? = null,
    val participants: List<LiveVideoParticipant> = emptyList(),
    val myRole: String? = null,
    val myUserId: String? = null,
    val isMicOn: Boolean = false,
    val isMicBusy: Boolean = false,
    val isCameraOn: Boolean = false,
    val isCameraBusy: Boolean = false,
    val isFrontCamera: Boolean = true,
    val speakingUserIds: Set<String> = emptySet(),
    // LiveKit identity (= ZRP userId, see mintLiveKitToken) -> that
    // participant's subscribed camera track (mine included once my camera
    // is on). A participant with no entry, or whose entry is in
    // [mutedVideoUserIds], renders as an avatar tile instead.
    val videoTracks: Map<String, VideoTrack> = emptyMap(),
    val mutedVideoUserIds: Set<String> = emptySet(),
    // Same "only heard while this screen is open" caveat as Live Audio's
    // pendingSpeakerRequestUserIds - see LiveAudioRoomUiState's comment.
    val pendingJoinRequestUserIds: List<String> = emptyList(),
    val joinRequestSent: Boolean = false,
    val actionBusyUserId: String? = null,
    val error: String? = null,
    val actionError: String? = null,
    val scheduledActionBusy: Boolean = false,
    val scheduledActionError: String? = null,
)

/**
 * ZRP Live Video's room - ported from src/app/live-video/[id]/page.tsx,
 * and structurally the same as LiveAudioRoomViewModel (read its KDoc
 * first: the socket-is-truth participant model, reconnect-with-fresh-
 * token on my own role change, and why leave() - not onCleared() - makes
 * the real POST /leave call all apply here unchanged).
 *
 * The real difference is media. Every on-camera participant's camera
 * track is tracked from LiveKit's TrackSubscribed/TrackUnsubscribed/
 * TrackMuted/TrackUnmuted events and rendered as a tile; the camera is a
 * second, independently toggleable track alongside the mic (a camera-off
 * participant can still be unmuted and vice versa). Like web, joining
 * never auto-enables the camera or mic for anyone, including the host.
 *
 * Real-time room state arrives as `live-video:*` events on the room's
 * channel (`join-live-video-room`): participant-joined/-left/-removed,
 * role-changed, mute-changed, camera-changed (a moderator forcing a
 * camera off), room-ended, you-were-removed, speaker-request. Chat,
 * gifts, reactions and recording ride the same channel via
 * [interactions].
 */
class LiveVideoRoomViewModel(
    private val roomId: String,
    private val repository: LiveVideoRepository = LiveVideoRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(LiveVideoRoomUiState())
    val state: StateFlow<LiveVideoRoomUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private var livekitRoom: Room? = null
    private var joinedSuccessfully = false

    val interactions = LiveInteractionsController(
        kind = LiveRoomKind.VIDEO,
        roomId = roomId,
        scope = viewModelScope,
        onUnknownUser = { loadDetail() },
        onRoomStateStale = { loadDetail() },
    )

    /** The connected LiveKit Room, for initialising video renderers (Room.initVideoRenderer). Null until CONNECTED. */
    fun rendererRoom(): Room? = livekitRoom

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
                            pendingJoinRequestUserIds = removePendingSpeakerRequest(current.pendingJoinRequestUserIds, current.myUserId ?: ""),
                            phase = if (current.phase == LiveVideoPhase.SCHEDULED && detail.room.status != "SCHEDULED") {
                                if (detail.room.status == "LIVE") LiveVideoPhase.LOADING else LiveVideoPhase.ENDED
                            } else {
                                current.phase
                            },
                        )
                    }
                }
                .onFailure { error ->
                    if (_state.value.phase == LiveVideoPhase.LOADING) {
                        _state.update { it.copy(phase = LiveVideoPhase.ERROR, error = error.message) }
                    }
                }
        }
    }

    /** [context] is only used to construct the LiveKit Room (application context, never retained beyond this call). */
    fun connect(context: Context) {
        if (livekitRoom != null || _state.value.phase == LiveVideoPhase.CONNECTING) return
        _state.update { it.copy(phase = LiveVideoPhase.CONNECTING, error = null) }

        viewModelScope.launch {
            val ownUserId = repository.getOwnUserId().getOrNull()
            _state.update { it.copy(myUserId = ownUserId) }
            interactions.setMyUserId(ownUserId)

            // See LiveAudioRoomViewModel.connect(): only a LIVE room is joined.
            val preJoin = repository.getRoom(roomId).getOrNull()
            if (preJoin != null && preJoin.room.status != "LIVE") {
                interactions.updateKnownUsers(preJoin.participants.map { it.user })
                _state.update {
                    it.copy(
                        room = preJoin.room,
                        participants = preJoin.participants,
                        myRole = preJoin.myRole,
                        phase = if (preJoin.room.status == "SCHEDULED") LiveVideoPhase.SCHEDULED else LiveVideoPhase.ENDED,
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
                        _state.update { it.copy(phase = LiveVideoPhase.CONNECTED, myRole = join.participant.role) }
                        connectSocket(ownUserId)
                        loadDetail()
                        interactions.loadChatHistory()
                        interactions.loadCatalog()
                    } catch (e: Exception) {
                        livekitRoom?.disconnect()
                        livekitRoom = null
                        _state.update { it.copy(phase = LiveVideoPhase.ERROR, error = e.message) }
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(phase = LiveVideoPhase.ERROR, error = error.message) }
                }
        }
    }

    private fun observeRoomEvents(room: Room) {
        viewModelScope.launch {
            room.events.collect { event ->
                when (event) {
                    is RoomEvent.ActiveSpeakersChanged -> {
                        val speakingIds = event.speakers.mapNotNull { it.identity?.value }.toSet()
                        _state.update { it.copy(speakingUserIds = speakingIds) }
                    }
                    is RoomEvent.TrackSubscribed -> {
                        val track = event.track as? VideoTrack ?: return@collect
                        if (event.publication.source == Track.Source.SCREEN_SHARE) return@collect
                        val identity = event.participant.identity?.value ?: return@collect
                        _state.update {
                            it.copy(
                                videoTracks = it.videoTracks + (identity to track),
                                mutedVideoUserIds = if (event.publication.muted) it.mutedVideoUserIds + identity else it.mutedVideoUserIds - identity,
                            )
                        }
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        if (event.track !is VideoTrack) return@collect
                        val identity = event.participant.identity?.value ?: return@collect
                        _state.update { current ->
                            if (current.videoTracks[identity] === event.track) {
                                current.copy(videoTracks = current.videoTracks - identity)
                            } else {
                                current
                            }
                        }
                    }
                    is RoomEvent.TrackMuted -> {
                        if (event.publication.kind != Track.Kind.VIDEO) return@collect
                        val identity = event.participant.identity?.value ?: return@collect
                        _state.update { it.copy(mutedVideoUserIds = it.mutedVideoUserIds + identity) }
                    }
                    is RoomEvent.TrackUnmuted -> {
                        if (event.publication.kind != Track.Kind.VIDEO) return@collect
                        val identity = event.participant.identity?.value ?: return@collect
                        _state.update { it.copy(mutedVideoUserIds = it.mutedVideoUserIds - identity) }
                    }
                    else -> Unit
                }
            }
        }
    }

    private fun connectSocket(ownUserId: String?) {
        if (socket != null) return
        val liveSocket = ZrpSocket.connect(ApiClient.getTokenStore())
        socket = liveSocket

        liveSocket.on("live-video:participant-joined", Emitter.Listener { loadDetail() })
        liveSocket.on("live-video:participant-left", Emitter.Listener { loadDetail() })

        liveSocket.on("live-video:participant-removed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioParticipantRemovedPayload::class.java) ?: return@Listener
            if (payload.userId != ownUserId) loadDetail()
        })

        liveSocket.on("live-video:role-changed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioRoleChangedPayload::class.java) ?: return@Listener
            loadDetail()
            if (payload.userId == ownUserId) {
                // Demoted to viewer: stop publishing locally right away -
                // the fresh token below no longer grants it anyway.
                if (!canPublishLiveVideo(payload.role)) disableLocalMedia()
                reconnectWithFreshToken()
            }
        })

        liveSocket.on("live-video:mute-changed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioMuteChangedPayload::class.java) ?: return@Listener
            loadDetail()
            if (payload.userId == ownUserId && payload.isMuted) {
                viewModelScope.launch {
                    runCatching { livekitRoom?.localParticipant?.setMicrophoneEnabled(false) }
                }
                _state.update { it.copy(isMicOn = false) }
            }
        })

        liveSocket.on("live-video:camera-changed", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveVideoCameraChangedPayload::class.java) ?: return@Listener
            loadDetail()
            if (payload.userId == ownUserId && payload.isCameraOff) {
                viewModelScope.launch {
                    runCatching { livekitRoom?.localParticipant?.setCameraEnabled(false) }
                }
                _state.update { it.copy(isCameraOn = false, videoTracks = it.videoTracks - payload.userId) }
            }
        })

        liveSocket.on("live-video:room-ended", Emitter.Listener {
            _state.update { it.copy(phase = LiveVideoPhase.ENDED, room = it.room?.copy(status = "ENDED")) }
            livekitRoom?.disconnect()
        })

        liveSocket.on("live-video:you-were-removed", Emitter.Listener {
            _state.update { it.copy(phase = LiveVideoPhase.REMOVED) }
            livekitRoom?.disconnect()
        })

        liveSocket.on("live-video:speaker-request", Emitter.Listener { args ->
            val payload = parsePayload(args, LiveAudioSpeakerRequestPayload::class.java) ?: return@Listener
            _state.update { current ->
                current.copy(pendingJoinRequestUserIds = addPendingSpeakerRequest(current.pendingJoinRequestUserIds, payload.userId))
            }
        })

        interactions.attach(liveSocket)

        // Re-join the room channel on every (re)connect - see
        // LiveAudioRoomViewModel.connectSocket for why.
        liveSocket.on(Socket.EVENT_CONNECT, Emitter.Listener { liveSocket.emit("join-live-video-room", roomId) })
        liveSocket.emit("join-live-video-room", roomId)
    }

    private fun reconnectWithFreshToken() {
        viewModelScope.launch {
            val room = livekitRoom ?: return@launch
            repository.refreshToken(roomId).onSuccess { token ->
                runCatching { room.connect(token.livekitUrl, token.token) }
            }
        }
    }

    private fun disableLocalMedia() {
        viewModelScope.launch {
            runCatching { livekitRoom?.localParticipant?.setCameraEnabled(false) }
            runCatching { livekitRoom?.localParticipant?.setMicrophoneEnabled(false) }
        }
        _state.update { current ->
            val me = current.myUserId
            current.copy(isCameraOn = false, isMicOn = false, videoTracks = if (me != null) current.videoTracks - me else current.videoTracks)
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
            val ok = runCatching { room.localParticipant.setMicrophoneEnabled(turningOn) }.getOrDefault(false)
            _state.update { it.copy(isMicBusy = false, isMicOn = if (ok) turningOn else it.isMicOn) }
        }
    }

    /**
     * Self camera on/off - a purely client-side LiveKit toggle, exactly
     * like the mic (the /camera route is only for a moderator forcing
     * someone else's camera off). Permission denied / no camera surfaces
     * as a thrown exception and simply leaves the toggle unflipped.
     */
    fun toggleCamera() {
        val room = livekitRoom ?: return
        if (_state.value.isCameraBusy) return
        val turningOn = !_state.value.isCameraOn
        _state.update { it.copy(isCameraBusy = true) }
        viewModelScope.launch {
            val ok = runCatching { room.localParticipant.setCameraEnabled(turningOn) }.getOrDefault(false)
            val me = _state.value.myUserId
            val localTrack = if (ok && turningOn) {
                room.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
            } else {
                null
            }
            _state.update { current ->
                val tracks = when {
                    me == null -> current.videoTracks
                    ok && turningOn && localTrack != null -> current.videoTracks + (me to localTrack)
                    ok && !turningOn -> current.videoTracks - me
                    else -> current.videoTracks
                }
                current.copy(
                    isCameraBusy = false,
                    isCameraOn = if (ok) turningOn else current.isCameraOn,
                    videoTracks = tracks,
                    mutedVideoUserIds = if (me != null && ok && turningOn) current.mutedVideoUserIds - me else current.mutedVideoUserIds,
                )
            }
        }
    }

    fun switchCamera() {
        val room = livekitRoom ?: return
        val track = room.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack ?: return
        runCatching { track.switchCamera() }.onSuccess {
            _state.update { it.copy(isFrontCamera = !it.isFrontCamera) }
        }
    }

    fun requestToJoin() {
        viewModelScope.launch {
            repository.requestToJoin(roomId)
                .onSuccess { _state.update { it.copy(joinRequestSent = true) } }
                .onFailure { error -> _state.update { it.copy(actionError = error.message) } }
        }
    }

    fun resolveJoinRequest(userId: String, approve: Boolean) {
        _state.update { it.copy(actionBusyUserId = userId) }
        viewModelScope.launch {
            val result = if (approve) repository.approveJoinRequest(roomId, userId) else repository.rejectJoinRequest(roomId, userId)
            result
                .onSuccess {
                    _state.update { current ->
                        current.copy(
                            actionBusyUserId = null,
                            pendingJoinRequestUserIds = removePendingSpeakerRequest(current.pendingJoinRequestUserIds, userId),
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
    fun forceCameraOff(userId: String) = moderate(userId) { repository.setCamera(roomId, userId, cameraOff = true) }
    fun allowCamera(userId: String) = moderate(userId) { repository.setCamera(roomId, userId, cameraOff = false) }
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

    fun endRoom() {
        viewModelScope.launch {
            repository.endRoom(roomId).onFailure { error -> _state.update { it.copy(actionError = error.message) } }
        }
    }

    fun startScheduledRoom(context: Context) {
        if (_state.value.scheduledActionBusy) return
        _state.update { it.copy(scheduledActionBusy = true, scheduledActionError = null) }
        viewModelScope.launch {
            repository.startRoom(roomId)
                .onSuccess { response ->
                    _state.update { it.copy(scheduledActionBusy = false, room = response.room, phase = LiveVideoPhase.LOADING) }
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
                    _state.update { it.copy(scheduledActionBusy = false, room = it.room?.copy(status = "CANCELLED"), phase = LiveVideoPhase.ENDED) }
                }
                .onFailure { error -> _state.update { it.copy(scheduledActionBusy = false, scheduledActionError = error.message) } }
        }
    }

    fun recheckScheduledRoom(context: Context) {
        if (_state.value.phase != LiveVideoPhase.SCHEDULED) return
        _state.update { it.copy(phase = LiveVideoPhase.LOADING) }
        connect(context)
    }

    /** See LiveAudioRoomViewModel.leave() - called by the screen before navigating away. */
    fun leave() {
        viewModelScope.launch {
            if (joinedSuccessfully) repository.leaveRoom(roomId)
        }
        teardownLocal()
    }

    private fun teardownLocal() {
        socket?.let { liveSocket ->
            liveSocket.off("live-video:participant-joined")
            liveSocket.off("live-video:participant-left")
            liveSocket.off("live-video:participant-removed")
            liveSocket.off("live-video:role-changed")
            liveSocket.off("live-video:mute-changed")
            liveSocket.off("live-video:camera-changed")
            liveSocket.off("live-video:room-ended")
            liveSocket.off("live-video:you-were-removed")
            liveSocket.off("live-video:speaker-request")
            liveSocket.off(Socket.EVENT_CONNECT)
            interactions.detach(liveSocket)
            if (joinedSuccessfully) liveSocket.emit("leave-live-video-room", roomId)
            liveSocket.disconnect()
        }
        socket = null
        livekitRoom?.disconnect()
        livekitRoom = null
        joinedSuccessfully = false
        interactions.cancelPendingWork()
        _state.update { it.copy(videoTracks = emptyMap()) }
    }

    override fun onCleared() {
        teardownLocal()
    }
}

class LiveVideoRoomViewModelFactory(private val roomId: String) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LiveVideoRoomViewModel(roomId) as T
}
