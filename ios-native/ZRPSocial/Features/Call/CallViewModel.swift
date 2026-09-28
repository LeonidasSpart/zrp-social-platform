import AVFoundation
import Foundation
import WebRTC

enum CallPhase: Equatable {
    case idle
    case calling
    case incoming
    case active
}

/// A call problem the screen needs to show translated - kept separate
/// from a plain string since a view model can't resolve `L10nKey`
/// strings for itself the way a SwiftUI view can. Mirrors the Android
/// sibling's own `CallError` sealed class case-for-case.
enum CallError: Equatable {
    /// A real human declined, or the server sent `call-rejected` with no
    /// `reason` at all (older server).
    case rejected
    /// `call-rejected` carried `reason: "unavailable"` or
    /// `"service-unavailable"` - the recipient was never actually
    /// reachable, not a real decline.
    case unavailable
    /// This side's own ICE gathering never completed within the signal
    /// timeout, so `call-user`/`accept-call` was never even sent.
    case connectionFailed
    /// `call-user` was sent (this side's signal fired) but the callee
    /// never answered within the answer timeout.
    case noAnswer
    case connectionError(String)
    case micCameraError(String)
    case missingCallerId
}

/// `call-rejected`'s `reason` field to the `CallError` it means - pure
/// and free of `ZrpSocket`/WebRTC so it can be unit tested directly.
/// Mirrors `CallViewModel.kt`'s own inline `reason == "unavailable" ||
/// reason == "service-unavailable"` check.
func callErrorForRejectReason(_ reason: String?) -> CallError {
    reason == "unavailable" || reason == "service-unavailable" ? .unavailable : .rejected
}

/// `m:ss`, matching the Android sibling's own `formatDuration`.
func formatCallDuration(_ seconds: Int) -> String {
    let minutes = seconds / 60
    let secs = seconds % 60
    return String(format: "%d:%02d", minutes, secs)
}

/// The same real WebRTC voice/video calling `src/app/messages/
/// [username]/page.tsx` drives via simple-peer (browser
/// `RTCPeerConnection`), speaking the exact same signaling protocol
/// `server.js` already relays over Socket.IO - nothing server-side
/// changes for this native client:
///
/// ```
/// emit "call-user"   {receiverId, signal, isVideo}
/// on   "incoming-call" {callerId, callerName, signal, isVideo}
/// emit "accept-call" {callerId, signal}
/// on   "call-accepted" {signal}
/// emit "reject-call" {callerId}
/// on   "call-rejected" {reason?}
/// emit "end-call"    {callerId}
/// on   "call-ended"  {}
/// ```
///
/// simple-peer runs with `trickle:false` (page.tsx's own `new
/// Peer({trickle: false, ...})`), so each side sends exactly ONE signal
/// - a full SDP with every ICE candidate already gathered and embedded,
/// not a candidate-by-candidate stream. That maps directly onto this
/// `RTCPeerConnection` waiting for ICE gathering `.complete` before
/// reading its local description and sending it as `signal`, rather
/// than relaying `didGenerate candidate:` calls individually - so this
/// client never needs its own trickle-ICE signaling path at all, hence
/// `RTCConfiguration.continualGatheringPolicy = .gatherOnce` below.
///
/// `otherPartyId` tracks "the other party's id" for BOTH directions
/// (`receiverId` when this side initiated, `callerId` when this side
/// received) - matching a fix already made on the Android sibling: the
/// web page's own `endCall()` only ever reads a ref set on the callee
/// side, so hanging up as the caller never actually emits `end-call`
/// there. That is a real, latent web bug, not a design this client
/// should copy.
///
/// This is the app's second third-party dependency (after LiveKit for
/// Live Audio): `stasel/WebRTC`, a community SwiftPM
/// distribution of Google's own prebuilt libwebrtc binaries (Google
/// stopped shipping its own since M80). Its API surface is the same
/// libwebrtc ObjC/Swift bridge the Android sibling's `org.webrtc.*`
/// classes wrap in Kotlin, so this file mirrors `CallViewModel.kt`
/// almost line for line.
@MainActor
final class CallViewModel: NSObject, ObservableObject {

    @Published private(set) var phase: CallPhase = .idle
    @Published private(set) var isVideo = false
    @Published private(set) var callerName = ""
    @Published private(set) var isMuted = false
    @Published private(set) var isVideoEnabled = true
    @Published private(set) var isSpeakerOn = false
    @Published private(set) var hasRemoteStream = false
    @Published var error: CallError?
    @Published private(set) var localVideoTrack: RTCVideoTrack?
    @Published private(set) var remoteVideoTrack: RTCVideoTrack?

    private let repository: CallRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var otherPartyId: String?
    private var endingCall = false
    private var incomingSignal: CallSignal?

    // See CALL_SIGNAL_TIMEOUT/CALL_ANSWER_TIMEOUT below - both are
    // non-trickle-ICE timeouts: this side never sends anything to the
    // signaling server until ICE gathering has fully completed, which is
    // why a stalled gather has to be caught with a timer rather than left
    // to WebRTC's own connection-state machinery (nothing has even been
    // sent to time out on yet).
    private static let signalTimeout: Duration = .seconds(20)
    private static let answerTimeout: Duration = .seconds(45)
    private var signalTimeoutTask: Task<Void, Never>?
    private var answerTimeoutTask: Task<Void, Never>?

    private func clearCallTimeouts() {
        signalTimeoutTask?.cancel()
        signalTimeoutTask = nil
        answerTimeoutTask?.cancel()
        answerTimeoutTask = nil
    }

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }()

    private var peerConnection: RTCPeerConnection?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var localAudioTrack: RTCAudioTrack?
    private var onIceGatheringComplete: (() -> Void)?
    private var currentCameraPosition: AVCaptureDevice.Position = .front

    init(repository: CallRepositoryProtocol = CallRepository(), socket: ZrpSocket? = nil) {
        self.repository = repository
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated (see
        // `LiveAudioRoomViewModel`'s own identical reasoning).
        self.socket = socket ?? .shared
        super.init()
    }

    // MARK: - Signaling

    private struct CallSignal: Codable {
        let type: String
        let sdp: String
    }

    private struct IncomingCallPayload: Decodable {
        let callerId: String
        let callerName: String?
        let isVideo: Bool?
        let signal: CallSignal
    }

    private struct CallAcceptedPayload: Decodable {
        let signal: CallSignal
    }

    private struct CallRejectedPayload: Decodable {
        let reason: String?
    }

    /// Connects the signaling socket - a call is only reachable while
    /// this is alive. Safe to call repeatedly and from app startup: it
    /// mirrors `IncomingCallResponder`'s own former lifetime, now
    /// superseded by this view model owning both halves (declining AND
    /// actually answering) of an incoming call.
    func connectSignaling() {
        guard socketToken == nil else { return }
        socket.connect()
        socketToken = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "incoming-call":
                self.handleIncomingCall(event.data)
            case "call-accepted":
                self.handleCallAccepted(event.data)
            case "call-rejected":
                self.handleCallRejected(event.data)
            case "call-ended":
                self.handleCallEnded()
            default:
                break
            }
        }
    }

    func disconnectSignaling() {
        if let socketToken { socket.unsubscribe(socketToken) }
        socketToken = nil
        clearCallTimeouts()
        teardownPeer()
        phase = .idle
        error = nil
        otherPartyId = nil
        incomingSignal = nil
    }

    private func handleIncomingCall(_ data: Data) {
        guard let payload = try? JSONDecoder().decode(IncomingCallPayload.self, from: data) else { return }
        otherPartyId = payload.callerId
        incomingSignal = payload.signal
        phase = .incoming
        isVideo = payload.isVideo ?? false
        callerName = payload.callerName ?? ""
        error = nil
    }

    private func handleCallAccepted(_ data: Data) {
        clearCallTimeouts()
        guard let payload = try? JSONDecoder().decode(CallAcceptedPayload.self, from: data) else { return }
        let type = RTCSessionDescription.type(for: payload.signal.type)
        let description = RTCSessionDescription(type: type, sdp: payload.signal.sdp)
        peerConnection?.setRemoteDescription(description) { _ in }
    }

    /// `reason` is additive (`server.js`) - an older/never-updated
    /// server still sends a bare event (no `reason` key), which falls
    /// through to the original, generic Rejected wording exactly as
    /// before.
    private func handleCallRejected(_ data: Data) {
        clearCallTimeouts()
        teardownPeer()
        let reason = (try? JSONDecoder().decode(CallRejectedPayload.self, from: data))?.reason
        phase = .idle
        error = callErrorForRejectReason(reason)
        otherPartyId = nil
    }

    private func handleCallEnded() {
        clearCallTimeouts()
        teardownPeer()
        phase = .idle
        error = nil
        otherPartyId = nil
    }

    // MARK: - Placing / accepting

    func startCall(receiverId: String, isVideo: Bool) {
        endingCall = false
        otherPartyId = receiverId
        phase = .calling
        self.isVideo = isVideo
        error = nil

        Task {
            let iceServers = (try? await repository.iceServers()) ?? []
            do {
                let peerConnection = try makePeerConnection(iceServers: iceServers)
                self.peerConnection = peerConnection
                attachLocalMedia(to: peerConnection, isVideo: isVideo)

                // See `signalTimeout`'s doc comment above: if this side's
                // own ICE gathering never reaches `.complete` below,
                // `call-user` is never sent and the caller would
                // otherwise sit on "Calling..." forever.
                signalTimeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: Self.signalTimeout)
                    guard !Task.isCancelled, let self else { return }
                    self.signalTimeoutTask = nil
                    self.teardownPeer()
                    self.phase = .idle
                    self.error = .connectionFailed
                    self.otherPartyId = nil
                }

                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                peerConnection.offer(for: constraints) { sdp, _ in
                    guard let sdp else { return }
                    peerConnection.setLocalDescription(sdp) { _ in }
                    Task { @MainActor [weak self] in
                        self?.onIceGatheringComplete = { [weak self] in
                            guard let self else { return }
                            self.signalTimeoutTask?.cancel()
                            self.signalTimeoutTask = nil
                            guard let local = peerConnection.localDescription else { return }
                            self.socket.emit("call-user", [
                                "receiverId": receiverId,
                                "signal": [
                                    "type": RTCSessionDescription.string(for: local.type),
                                    "sdp": local.sdp,
                                ],
                                "isVideo": isVideo,
                            ])

                            // See `answerTimeout`'s doc comment above:
                            // the callee may never answer at all
                            // (offline, ignored, declined without
                            // emitting `reject-call`). Cleared by
                            // `call-accepted`/`call-rejected`/
                            // `call-ended`, or by `didAdd stream:`
                            // below, whichever resolves the call first.
                            self.answerTimeoutTask = Task { [weak self] in
                                try? await Task.sleep(for: Self.answerTimeout)
                                guard !Task.isCancelled else { return }
                                self?.answerTimeoutTask = nil
                                self?.endCall(error: .noAnswer)
                            }
                        }
                    }
                }
            } catch {
                self.teardownPeer()
                self.phase = .idle
                self.error = .micCameraError("\(error)")
            }
        }
    }

    func acceptCall() {
        guard let signal = incomingSignal else { return }
        let isVideo = self.isVideo
        endingCall = false

        Task {
            let iceServers = (try? await repository.iceServers()) ?? []
            do {
                let peerConnection = try makePeerConnection(iceServers: iceServers)
                self.peerConnection = peerConnection
                attachLocalMedia(to: peerConnection, isVideo: isVideo)

                // See `signalTimeout`'s doc comment above (callee side):
                // if this side's own ICE gathering stalls, `accept-call`
                // is never sent and both parties would otherwise be
                // stuck. `rejectCall()` also notifies the caller (it
                // already knows about this call attempt from
                // `incoming-call`), so it's used here rather than a bare
                // local reset.
                signalTimeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: Self.signalTimeout)
                    guard !Task.isCancelled else { return }
                    self?.signalTimeoutTask = nil
                    self?.rejectCall(error: .connectionFailed)
                }

                let type = RTCSessionDescription.type(for: signal.type)
                let remote = RTCSessionDescription(type: type, sdp: signal.sdp)
                peerConnection.setRemoteDescription(remote) { _ in
                    let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                    peerConnection.answer(for: constraints) { answerSdp, _ in
                        guard let answerSdp else { return }
                        peerConnection.setLocalDescription(answerSdp) { _ in }
                        Task { @MainActor [weak self] in
                            self?.onIceGatheringComplete = { [weak self] in
                                guard let self else { return }
                                self.signalTimeoutTask?.cancel()
                                self.signalTimeoutTask = nil
                                guard let local = peerConnection.localDescription else { return }
                                guard let callerId = self.otherPartyId else {
                                    self.error = .missingCallerId
                                    return
                                }
                                self.socket.emit("accept-call", [
                                    "callerId": callerId,
                                    "signal": [
                                        "type": RTCSessionDescription.string(for: local.type),
                                        "sdp": local.sdp,
                                    ],
                                ])
                            }
                        }
                    }
                }
            } catch {
                self.rejectCall()
                self.error = .micCameraError("\(error)")
            }
        }
    }

    /// `error` lets the two timeout paths above surface a reason
    /// (`.connectionFailed`); the plain "person tapped decline" call
    /// site keeps the default of no error.
    func rejectCall(error: CallError? = nil) {
        clearCallTimeouts()
        if let id = otherPartyId { socket.emit("reject-call", ["callerId": id]) }
        teardownPeer()
        phase = .idle
        self.error = error
        otherPartyId = nil
        incomingSignal = nil
    }

    /// `error` lets the answer-timeout path above surface `.noAnswer`;
    /// the plain "person tapped end call" call site keeps the default
    /// of no error.
    func endCall(error: CallError? = nil) {
        clearCallTimeouts()
        endingCall = true
        if let id = otherPartyId { socket.emit("end-call", ["callerId": id]) }
        teardownPeer()
        phase = .idle
        self.error = error
        otherPartyId = nil
        incomingSignal = nil
    }

    func dismissError() {
        error = nil
    }

    // MARK: - In-call controls

    func toggleMute() {
        let nowMuted = !isMuted
        localAudioTrack?.isEnabled = !nowMuted
        isMuted = nowMuted
    }

    func toggleVideo() {
        let nowEnabled = !isVideoEnabled
        localVideoTrack?.isEnabled = nowEnabled
        isVideoEnabled = nowEnabled
    }

    /// Earpiece <-> speaker, for a call already in progress.
    func toggleSpeaker() {
        let nowOn = !isSpeakerOn
        applySpeakerOverride(nowOn)
        isSpeakerOn = nowOn
    }

    /// Front <-> back camera, for a video call already in progress.
    /// Tracks the active position itself rather than introspecting the
    /// capturer's underlying `AVCaptureSession` - one fewer assumption
    /// about an API surface this file has no way to verify against a
    /// real build.
    func switchCamera() {
        guard let capturer = videoCapturer else { return }
        let nextPosition: AVCaptureDevice.Position = currentCameraPosition == .front ? .back : .front
        guard
            let device = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == nextPosition }),
            let format = bestFormat(for: device)
        else { return }
        capturer.startCapture(with: device, format: format, fps: bestFrameRate(for: format))
        currentCameraPosition = nextPosition
    }

    // MARK: - PeerConnection setup

    private func makePeerConnection(iceServers: [IceServer]) throws -> RTCPeerConnection {
        let config = RTCConfiguration()
        config.iceServers = iceServers.map {
            RTCIceServer(urlStrings: $0.urls, username: $0.username, credential: $0.credential)
        }
        config.sdpSemantics = .unifiedPlan
        // Matches `trickle:false` on web / the Android sibling's
        // un-overridden default: one full SDP, sent only once ICE
        // gathering reaches `.complete` - see this type's own doc
        // comment for why that's the wire contract every ZRP client
        // already speaks.
        config.continualGatheringPolicy = .gatherOnce
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": kRTCMediaConstraintsValueTrue]
        )
        guard let peerConnection = Self.factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            throw ApiError.transport(underlying: "RTCPeerConnectionFactory returned nil")
        }
        return peerConnection
    }

    private func attachLocalMedia(to peerConnection: RTCPeerConnection, isVideo: Bool) {
        configureCallAudioSession(video: isVideo)

        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = Self.factory.audioSource(with: audioConstraints)
        let audioTrack = Self.factory.audioTrack(with: audioSource, trackId: "zrp-audio")
        localAudioTrack = audioTrack
        _ = peerConnection.add(audioTrack, streamIds: ["zrp-stream"])

        guard isVideo else { return }
        let videoSource = Self.factory.videoSource()
        let capturer = RTCCameraVideoCapturer(delegate: videoSource)
        videoCapturer = capturer
        let videoTrack = Self.factory.videoTrack(with: videoSource, trackId: "zrp-video")
        localVideoTrack = videoTrack
        _ = peerConnection.add(videoTrack, streamIds: ["zrp-stream"])

        guard
            let frontCamera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == .front }),
            let format = bestFormat(for: frontCamera)
        else { return }
        capturer.startCapture(with: frontCamera, format: format, fps: bestFrameRate(for: format))
    }

    /// Highest-resolution supported format, matching the Android
    /// sibling's own fixed 1280x720 request as closely as the device's
    /// real capabilities allow, rather than assuming every device
    /// supports that exact size.
    private func bestFormat(for device: AVCaptureDevice) -> AVCaptureDevice.Format? {
        RTCCameraVideoCapturer.supportedFormats(for: device).max {
            CMVideoFormatDescriptionGetDimensions($0.formatDescription).width
                < CMVideoFormatDescriptionGetDimensions($1.formatDescription).width
        }
    }

    private func bestFrameRate(for format: AVCaptureDevice.Format) -> Int {
        let max = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 30
        return Int(max)
    }

    private func teardownPeer() {
        onIceGatheringComplete = nil
        peerConnection?.close()
        peerConnection = nil
        videoCapturer?.stopCapture()
        videoCapturer = nil
        localVideoTrack = nil
        localAudioTrack = nil
        remoteVideoTrack = nil
        hasRemoteStream = false
        isMuted = false
        isVideoEnabled = true
        currentCameraPosition = .front
        teardownCallAudioSession()
    }

    // MARK: - Call audio routing

    /// Puts the device into real "phone call" audio mode. Neither this
    /// app nor the website's own browser `RTCPeerConnection` needs to do
    /// this for echo cancellation/gain (the OS's WebRTC-aware audio
    /// stack handles that once the category/mode below are set), but the
    /// speaker-vs-earpiece DEFAULT is a UX choice this app makes
    /// explicitly, matching how every mainstream calling app defaults
    /// video calls to speaker (typically held at a distance) and voice
    /// calls to earpiece - mirrors the Android sibling's own
    /// `setupCallAudio(defaultToSpeaker:)`.
    private func configureCallAudioSession(video: Bool) {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        do {
            try session.setCategory(AVAudioSession.Category.playAndRecord.rawValue)
            try session.setMode((video ? AVAudioSession.Mode.videoChat : .voiceChat).rawValue)
            try session.setActive(true)
        } catch {
            // Best-effort - see this method's own doc comment. A failure
            // here degrades call audio quality but must never prevent
            // the call itself from connecting.
        }
        applySpeakerOverride(video)
        isSpeakerOn = video
    }

    private func applySpeakerOverride(_ on: Bool) {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        try? session.overrideOutputAudioPort(on ? .speaker : .none)
    }

    private func teardownCallAudioSession() {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        try? session.setActive(false)
    }
}

extension CallViewModel: RTCPeerConnectionDelegate {

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.clearCallTimeouts()
            if let track = stream.videoTracks.first {
                self.remoteVideoTrack = track
            }
            self.phase = .active
            self.hasRemoteStream = true
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        // Matches the website's own `newPeer.on("error", ...)` handler:
        // a benign teardown (`endingCall` already true) never shows as a
        // scary connection error, only a real mid-call drop does.
        guard newState == .failed else { return }
        Task { @MainActor [weak self] in
            guard let self, !self.endingCall else { return }
            self.error = .connectionError("\(newState.rawValue)")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        guard newState == .complete else { return }
        Task { @MainActor [weak self] in
            self?.onIceGatheringComplete?()
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
