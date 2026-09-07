package one.zrp.social.mobile.ui.call

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import one.zrp.social.mobile.data.CallRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.IceServerConfig
import one.zrp.social.mobile.network.ZrpSocket
import org.json.JSONObject as OrgJsonObject
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoTrack

enum class CallPhase { IDLE, CALLING, INCOMING, ACTIVE }

/**
 * A call problem the screen needs to show translated - kept separate
 * from a plain string the same way CreatePostViewModel's own
 * MediaValidationError is, since a plain ViewModel can't resolve
 * Android string resources itself; CallScreen maps each case to its
 * real, translated chat.* string (see translations.ts's own
 * callRejected/connectionError/micCameraError/missingCallerId keys).
 */
sealed class CallError {
    object Rejected : CallError()
    data class ConnectionError(val detail: String) : CallError()
    data class MicCameraError(val detail: String) : CallError()
    object MissingCallerId : CallError()
}

data class CallUiState(
    val phase: CallPhase = CallPhase.IDLE,
    val isVideo: Boolean = false,
    val callerName: String = "",
    val isMuted: Boolean = false,
    val isVideoEnabled: Boolean = true,
    val hasRemoteStream: Boolean = false,
    val error: CallError? = null,
)

/**
 * The same real WebRTC voice/video calling src/app/messages/[username]/
 * page.tsx drives via simple-peer (browser RTCPeerConnection), speaking
 * the exact same signaling protocol server.js already relays over
 * Socket.IO - nothing server-side changes for this native client:
 *
 * emit "call-user"   {receiverId, signal, callerName, isVideo, callerId}
 * on   "incoming-call" {callerId, signal, callerName, isVideo}
 * emit "accept-call" {callerId, signal}
 * on   "call-accepted" {signal}
 * emit "reject-call" {callerId}
 * on   "call-rejected" {}
 * emit "end-call"    {callerId}
 * on   "call-ended"  {}
 *
 * simple-peer runs with trickle:false (page.tsx's own `new Peer({trickle:
 * false, ...})`), so each side sends exactly ONE signal - a full SDP
 * with every ICE candidate already gathered and embedded, not a
 * candidate-by-candidate stream. That maps directly onto this
 * PeerConnection waiting for onIceGatheringChange(COMPLETE) before
 * reading localDescription and sending it as `signal`, rather than
 * relaying onIceCandidate() calls individually - so this client never
 * needs its own trickle-ICE signaling path at all.
 *
 * "signal" itself is `{type: "offer"|"answer", sdp: "..."}`, the same
 * shape SessionDescription.type/description already round-trips to/from
 * JSON as, since both sides ultimately wrap the same standard libwebrtc
 * SDP.
 *
 * One caveat fixed rather than ported: page.tsx's own endCall() always
 * reads callerIdRef (only ever set on the *callee* side, from
 * incoming-call), so hanging up as the *caller* never actually emits
 * "end-call" there - a real, latent web bug, not an intended design.
 * This tracks "the other party's id" for both directions (receiverId
 * when this side initiated, callerId when this side received) so a
 * hangup from either side reliably notifies the other, matching what
 * the feature is actually supposed to do.
 */
class CallViewModel(
    private val repository: CallRepository = CallRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(CallUiState())
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private var otherPartyId: String? = null
    private var endingCall = false
    private var incomingSignal: JsonObject? = null

    private var eglBase: EglBase? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var videoCapturer: VideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrack: VideoTrack? = null

    private val _localVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val localVideoTrackFlow: StateFlow<VideoTrack?> = _localVideoTrack.asStateFlow()
    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrackFlow: StateFlow<VideoTrack?> = _remoteVideoTrack.asStateFlow()

    fun eglBaseContext(): EglBase.Context? = eglBase?.eglBaseContext

    /** Connects the signaling socket - a call is only reachable while this is alive, matching page.tsx's own page-scoped setupSocket(). */
    fun connectSignaling() {
        if (socket != null) return
        val liveSocket = ZrpSocket.connect(ApiClient.getTokenStore())
        socket = liveSocket

        liveSocket.on("incoming-call", Emitter.Listener { args ->
            val payload = parsePayload(args) ?: return@Listener
            val callerId = payload.get("callerId")?.asString ?: return@Listener
            val callerName = payload.get("callerName")?.asString ?: ""
            val isVideo = payload.get("isVideo")?.asBoolean ?: false
            val signal = payload.getAsJsonObject("signal") ?: return@Listener

            otherPartyId = callerId
            incomingSignal = signal
            _state.update {
                it.copy(phase = CallPhase.INCOMING, isVideo = isVideo, callerName = callerName, error = null)
            }
        })

        liveSocket.on("call-accepted", Emitter.Listener { args ->
            val payload = parsePayload(args) ?: return@Listener
            val signal = payload.getAsJsonObject("signal") ?: return@Listener
            val type = signal.get("type")?.asString ?: return@Listener
            val sdp = signal.get("sdp")?.asString ?: return@Listener
            peerConnection?.setRemoteDescription(
                LoggingSdpObserver(),
                SessionDescription(SessionDescription.Type.fromCanonicalForm(type), sdp),
            )
        })

        liveSocket.on("call-rejected", Emitter.Listener {
            teardownPeer()
            _state.update { CallUiState(error = CallError.Rejected) }
            otherPartyId = null
        })

        liveSocket.on("call-ended", Emitter.Listener {
            teardownPeer()
            _state.update { CallUiState() }
            otherPartyId = null
        })
    }

    fun disconnectSignaling() {
        socket?.let { liveSocket ->
            liveSocket.off("incoming-call")
            liveSocket.off("call-accepted")
            liveSocket.off("call-rejected")
            liveSocket.off("call-ended")
            liveSocket.disconnect()
        }
        socket = null
        teardownPeer()
        _state.value = CallUiState()
    }

    private fun parsePayload(args: Array<out Any>): JsonObject? {
        val raw = args.getOrNull(0) as? OrgJsonObject ?: return null
        return try {
            gson.fromJson(raw.toString(), JsonObject::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun startCall(context: Context, receiverId: String, isVideo: Boolean) {
        endingCall = false
        otherPartyId = receiverId
        _state.update { it.copy(phase = CallPhase.CALLING, isVideo = isVideo, error = null) }

        viewModelScope.launch {
            // The callee's incoming-call UI shows this verbatim (see
            // page.tsx's own `callerName || "User"` fallback) - it must be
            // the real signed-in caller's name, not a placeholder.
            val callerDisplayName = runCatching { ApiClient.authApi.getSession().user?.name }
                .getOrNull()
                ?.takeIf { it.isNotBlank() }
                ?: "User"
            val iceServers = repository.getIceServers()
            try {
                ensureFactory(context)
                val pc = createPeerConnection(iceServers) ?: return@launch
                attachLocalMedia(context, pc, isVideo)

                pc.createOffer(object : SdpObserver by LoggingSdpObserver() {
                    override fun onCreateSuccess(sdp: SessionDescription) {
                        pc.setLocalDescription(LoggingSdpObserver(), sdp)
                    }
                }, MediaConstraints())

                onIceGatheringComplete = {
                    val local = pc.localDescription ?: return@onIceGatheringComplete
                    val signal = JsonObject().apply {
                        addProperty("type", local.type.canonicalForm())
                        addProperty("sdp", local.description)
                    }
                    socket?.emit(
                        "call-user",
                        OrgJsonObject()
                            .put("receiverId", receiverId)
                            .put("signal", OrgJsonObject(signal.toString()))
                            .put("callerName", callerDisplayName)
                            .put("isVideo", isVideo),
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(phase = CallPhase.IDLE, error = CallError.MicCameraError(e.message ?: e.toString()))
                }
            }
        }
    }

    fun acceptCall(context: Context) {
        val signal = incomingSignal ?: return
        val isVideo = _state.value.isVideo
        endingCall = false

        viewModelScope.launch {
            val iceServers = repository.getIceServers()
            try {
                ensureFactory(context)
                val pc = createPeerConnection(iceServers) ?: return@launch
                attachLocalMedia(context, pc, isVideo)

                val type = signal.get("type")?.asString ?: "offer"
                val sdp = signal.get("sdp")?.asString ?: return@launch
                pc.setRemoteDescription(
                    object : SdpObserver by LoggingSdpObserver() {
                        override fun onSetSuccess() {
                            pc.createAnswer(object : SdpObserver by LoggingSdpObserver() {
                                override fun onCreateSuccess(answer: SessionDescription) {
                                    pc.setLocalDescription(LoggingSdpObserver(), answer)
                                }
                            }, MediaConstraints())
                        }
                    },
                    SessionDescription(SessionDescription.Type.fromCanonicalForm(type), sdp),
                )

                onIceGatheringComplete = {
                    val local = pc.localDescription ?: return@onIceGatheringComplete
                    val callerId = otherPartyId
                    if (callerId == null) {
                        _state.update { it.copy(error = CallError.MissingCallerId) }
                        return@onIceGatheringComplete
                    }
                    val signalOut = JsonObject().apply {
                        addProperty("type", local.type.canonicalForm())
                        addProperty("sdp", local.description)
                    }
                    socket?.emit(
                        "accept-call",
                        OrgJsonObject()
                            .put("callerId", callerId)
                            .put("signal", OrgJsonObject(signalOut.toString())),
                    )
                }
            } catch (e: Exception) {
                rejectCall()
                _state.update { it.copy(error = CallError.MicCameraError(e.message ?: e.toString())) }
            }
        }
    }

    fun rejectCall() {
        otherPartyId?.let { id -> socket?.emit("reject-call", OrgJsonObject().put("callerId", id)) }
        teardownPeer()
        _state.value = CallUiState()
        otherPartyId = null
        incomingSignal = null
    }

    fun endCall() {
        endingCall = true
        otherPartyId?.let { id -> socket?.emit("end-call", OrgJsonObject().put("callerId", id)) }
        teardownPeer()
        _state.value = CallUiState()
        otherPartyId = null
        incomingSignal = null
    }

    fun toggleMute() {
        val nowMuted = !_state.value.isMuted
        localAudioTrack?.setEnabled(!nowMuted)
        _state.update { it.copy(isMuted = nowMuted) }
    }

    fun toggleVideo() {
        val nowEnabled = !_state.value.isVideoEnabled
        localVideoTrack?.setEnabled(nowEnabled)
        _state.update { it.copy(isVideoEnabled = nowEnabled) }
    }

    private fun ensureFactory(context: Context) {
        if (peerConnectionFactory != null) return
        val base = EglBase.create()
        eglBase = base

        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                .createInitializationOptions(),
        )

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(base.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(base.eglBaseContext))
            .createPeerConnectionFactory()
    }

    private var onIceGatheringComplete: (() -> Unit)? = null

    private fun createPeerConnection(iceServers: List<IceServerConfig>): PeerConnection? {
        val factory = peerConnectionFactory ?: return null
        val rtcIceServers = iceServers.map { server ->
            val builder = PeerConnection.IceServer.builder(server.urlList())
            if (!server.username.isNullOrBlank()) builder.setUsername(server.username)
            if (!server.credential.isNullOrBlank()) builder.setPassword(server.credential)
            builder.createIceServer()
        }
        val config = PeerConnection.RTCConfiguration(rtcIceServers)

        val pc = factory.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                // Matches page.tsx's own newPeer.on("error", ...) handler:
                // a benign teardown (endingCall already true) never shows
                // as a scary connection error, only a real mid-call drop
                // does.
                if (state == PeerConnection.IceConnectionState.FAILED && !endingCall) {
                    _state.update { it.copy(error = CallError.ConnectionError(state.name)) }
                }
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                if (state == PeerConnection.IceGatheringState.COMPLETE) {
                    onIceGatheringComplete?.invoke()
                }
            }
            override fun onIceCandidate(candidate: IceCandidate?) {}
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(channel: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onTrack(transceiver: RtpTransceiver?) {
                val track = transceiver?.receiver?.track()
                if (track is VideoTrack) {
                    _remoteVideoTrack.value = track
                }
                _state.update { it.copy(phase = CallPhase.ACTIVE, hasRemoteStream = true) }
            }
        }) ?: return null

        peerConnection = pc
        return pc
    }

    private fun attachLocalMedia(context: Context, pc: PeerConnection, isVideo: Boolean) {
        val factory = peerConnectionFactory ?: return
        val base = eglBase ?: return

        val audioSource = factory.createAudioSource(MediaConstraints())
        val audioTrack = factory.createAudioTrack("zrp-audio", audioSource)
        localAudioTrack = audioTrack
        pc.addTrack(audioTrack, listOf("zrp-stream"))

        if (isVideo) {
            val enumerator = Camera2Enumerator(context)
            val frontCamera = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                ?: enumerator.deviceNames.firstOrNull()
            if (frontCamera != null) {
                val capturer = enumerator.createCapturer(frontCamera, null)
                videoCapturer = capturer
                val helper = SurfaceTextureHelper.create("ZrpCallCapture", base.eglBaseContext)
                surfaceTextureHelper = helper
                val videoSource = factory.createVideoSource(capturer.isScreencast)
                capturer.initialize(helper, context.applicationContext, videoSource.capturerObserver)
                capturer.startCapture(1280, 720, 30)
                val videoTrack = factory.createVideoTrack("zrp-video", videoSource)
                localVideoTrack = videoTrack
                _localVideoTrack.value = videoTrack
                pc.addTrack(videoTrack, listOf("zrp-stream"))
            }
        }
    }

    private fun teardownPeer() {
        onIceGatheringComplete = null
        peerConnection?.close()
        peerConnection = null
        videoCapturer?.let {
            try {
                it.stopCapture()
            } catch (e: InterruptedException) {
                // Best-effort - the call is ending regardless.
            }
            it.dispose()
        }
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        localVideoTrack = null
        localAudioTrack = null
        _localVideoTrack.value = null
        _remoteVideoTrack.value = null
    }

    override fun onCleared() {
        disconnectSignaling()
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        eglBase?.release()
        eglBase = null
    }
}

/** SdpObserver's callbacks are pure diagnostics here - the real state transition is driven by ICE gathering / onTrack instead, matching the same "log it, act elsewhere" shape page.tsx's own newPeer.on("iceStateChange"/"connect") handlers use. */
private class LoggingSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription?) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}

class CallViewModelFactory : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = CallViewModel() as T
}
