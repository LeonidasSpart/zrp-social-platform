import Foundation
import LiveKit

/// Where a live room screen is in its lifecycle. Shared by Live Video
/// (and mirrored by `LiveAudioPhase`).
enum LiveRoomPhase: Equatable {
    /// Reading the room before deciding what to do with it.
    case loading
    /// SCHEDULED - not joinable yet; shows start/cancel or "Remind me".
    case scheduled
    case connecting
    case connected
    case ended
    case cancelled
    case removed
    case error
}

/// On camera = any role that can publish (HOST/MODERATOR/SPEAKER), host
/// first so the stage can make that tile prominent, then in join order
/// (the server already sorts by role then `joinedAt`).
func liveVideoStageOrder(_ participants: [LiveVideoParticipant]) -> [LiveVideoParticipant] {
    let onCamera = participants.filter { canPublishLiveAudio($0.role) }
    let hosts = onCamera.filter { $0.role == "HOST" }
    let others = onCamera.filter { $0.role != "HOST" }
    return hosts + others
}

/// The Live Video room - ported from `src/app/live-video/[id]/page.tsx`,
/// and a structural mirror of `LiveAudioRoomViewModel`: room and
/// participant state come from `live-video:*` Socket.IO events layered
/// over a REST re-fetch of `GET /live-video/rooms/{id}` (the database is
/// the truth), while the LiveKit `Room` is purely the media transport.
///
/// The genuine differences from Live Audio:
///
/// - **Camera tiles.** Every on-camera participant's subscribed camera
///   track is collected into `videoTracks` (keyed by LiveKit identity,
///   which the server mints as the ZRP user id). A tile shows video only
///   when a track exists *and* the database's moderator flag
///   `isCameraOff` is false; otherwise it falls back to the avatar.
/// - **An independent camera toggle** alongside the mic, and a
///   moderator-forced camera off (`POST .../camera`, the
///   `live-video:camera-changed` event).
///
/// Like Live Audio (and the web page), joining never turns on the mic or
/// the camera for anyone, the host included: every participant starts
/// with both off.
///
/// Before joining, the room is read once: a SCHEDULED room shows its
/// scheduled state (start/cancel or "Remind me") instead of a join that
/// would fail, and an ENDED/CANCELLED one goes straight to its end state.
@MainActor
final class LiveVideoRoomViewModel: NSObject, ObservableObject {

    @Published private(set) var phase: LiveRoomPhase = .loading
    @Published private(set) var room: LiveAudioRoom?
    @Published private(set) var participants: [LiveVideoParticipant] = []
    /// Only from `live-video:speaker-request` events heard while this
    /// screen is open - see Live Audio's identical field for the gap.
    @Published private(set) var pendingJoinRequestUserIds: [String] = []
    @Published private(set) var pendingRequestCount = 0
    @Published private(set) var myRole: String?
    @Published private(set) var myUserId: String?
    @Published private(set) var isMicOn = false
    @Published private(set) var isMicBusy = false
    @Published private(set) var isCameraOn = false
    @Published private(set) var isCameraBusy = false
    @Published private(set) var speakingUserIds: Set<String> = []
    @Published private(set) var videoTracks: [String: VideoTrack] = [:]
    @Published var error: String?
    @Published var actionError: String?
    @Published private(set) var joinRequestSent = false
    @Published private(set) var actionBusyUserId: String?
    @Published private(set) var isLifecycleBusy = false

    let engagement: LiveEngagementViewModel

    private let roomId: String
    private let repository: LiveVideoRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var connectToken: UUID?
    private var liveKitRoom: LiveKit.Room?
    /// The server has an active participant row for us (`POST /join`
    /// succeeded), whether or not the LiveKit connection then did - so
    /// leaving always closes that row instead of leaving a ghost
    /// participant behind after a failed media connection.
    private var serverJoined = false
    private var socketJoined = false

    init(
        roomId: String,
        repository: LiveVideoRepositoryProtocol = LiveVideoRepository(),
        engagementRepository: LiveEngagementRepositoryProtocol = LiveEngagementRepository(),
        socket: ZrpSocket? = nil
    ) {
        self.roomId = roomId
        self.repository = repository
        // Not a default argument - see `LiveAudioRoomViewModel.init`.
        let resolvedSocket = socket ?? .shared
        self.socket = resolvedSocket
        self.engagement = LiveEngagementViewModel(
            kind: .video,
            roomId: roomId,
            repository: engagementRepository,
            socket: resolvedSocket
        )
        super.init()
    }

    // MARK: - Derived

    var amAuthority: Bool { isLiveAudioAuthority(myRole) }
    var canPublish: Bool { canPublishLiveAudio(myRole) }
    var amHost: Bool { myUserId != nil && myUserId == room?.hostId }

    var stage: [LiveVideoParticipant] { liveVideoStageOrder(participants) }
    var viewers: [LiveVideoParticipant] { participants.filter { !canPublishLiveAudio($0.role) } }
    var host: LiveAudioHost? { participants.first { $0.role == "HOST" }?.user }

    /// My own participant row, for the moderator flags that apply to me.
    var me: LiveVideoParticipant? {
        guard let myUserId else { return nil }
        return participants.first { $0.user.id == myUserId }
    }

    /// A moderator forced my camera off - turning it back on is theirs to
    /// do (`cameraOff: false`), so the self toggle is disabled meanwhile.
    var isCameraForcedOff: Bool { me?.isCameraOff ?? false }

    func videoTrack(for userId: String) -> VideoTrack? {
        videoTracks[userId]
    }

    // MARK: - Entry

    /// Reads the room, then joins it if it is live. Safe to call again
    /// (from `.task`) - it only acts from the initial or error state.
    func start(currentUserId: String?) async {
        guard phase == .loading || phase == .error, liveKitRoom == nil else { return }
        myUserId = currentUserId
        phase = .loading
        error = nil
        do {
            let detail = try await repository.room(id: roomId)
            apply(detail)
            await route(for: detail.room.status)
        } catch {
            phase = .error
            self.error = roomErrorMessage(error)
        }
    }

    private func route(for status: String) async {
        switch status {
        case "SCHEDULED": phase = .scheduled
        case "ENDED": phase = .ended
        case "CANCELLED": phase = .cancelled
        default: await connect()
        }
    }

    /// Pull-to-refresh on the scheduled state - joins if the host has
    /// started meanwhile.
    func refreshScheduled() async {
        guard phase == .scheduled else { return }
        do {
            let detail = try await repository.room(id: roomId)
            apply(detail)
            if detail.room.status != "SCHEDULED" { await route(for: detail.room.status) }
        } catch {
            actionError = roomErrorMessage(error)
        }
    }

    func startScheduledRoom() {
        guard amHost, !isLifecycleBusy else { return }
        isLifecycleBusy = true
        actionError = nil
        Task {
            defer { self.isLifecycleBusy = false }
            do {
                room = try await repository.startRoom(id: roomId)
                await connect()
            } catch {
                actionError = roomErrorMessage(error)
            }
        }
    }

    func cancelScheduledRoom() {
        guard amHost, !isLifecycleBusy else { return }
        isLifecycleBusy = true
        actionError = nil
        Task {
            defer { self.isLifecycleBusy = false }
            do {
                try await repository.cancelRoom(id: roomId)
                phase = .cancelled
            } catch {
                actionError = roomErrorMessage(error)
            }
        }
    }

    private func connect() async {
        guard liveKitRoom == nil else { return }
        phase = .connecting
        error = nil
        do {
            let join = try await repository.joinRoom(id: roomId)
            serverJoined = true
            let liveKitRoom = LiveKit.Room(delegate: self)
            self.liveKitRoom = liveKitRoom
            try await liveKitRoom.connect(url: join.livekitUrl, token: join.token)
            myRole = join.participant.role
            phase = .connected
            subscribeSocket()
            engagement.start()
            await loadDetail()
            refreshVideoTracks()
        } catch {
            if let failedRoom = liveKitRoom { Task { await failedRoom.disconnect() } }
            liveKitRoom = nil
            phase = .error
            self.error = roomErrorMessage(error)
        }
    }

    private func loadDetail() async {
        do {
            apply(try await repository.room(id: roomId))
        } catch {
            // A failed re-fetch after some other participant's event keeps
            // the last-known-good state on screen (same as Live Audio).
        }
    }

    private func apply(_ detail: LiveVideoRoomDetail) {
        room = detail.room
        participants = detail.participants
        myRole = detail.myRole ?? myRole
        pendingRequestCount = detail.pendingRequestCount
        if let myUserId {
            pendingJoinRequestUserIds = removePendingSpeakerRequest(pendingJoinRequestUserIds, myUserId)
        }
        engagement.updateContext(
            myUserId: myUserId,
            room: detail.room,
            myRole: detail.myRole,
            people: detail.participants.map {
                LiveChatAuthor(id: $0.user.id, username: $0.user.username, name: $0.user.name, avatarUrl: $0.user.avatarUrl)
            }
        )
    }

    private func roomErrorMessage(_ error: Error) -> String {
        guard let apiError = error as? ApiError else { return L10n.string(.liveAudioJoinError) }
        switch apiError.serverCode {
        case "not_configured": return L10n.string(.liveVideoNotConfigured)
        case "room_not_found": return L10n.string(.liveAudioRoomNotFound)
        case "room_not_live", "invalid_state": return L10n.string(.iosLiveErrRoomNotLive)
        case "room_already_ended": return L10n.string(.liveAudioRoomEndedTitle)
        case "removed_from_room": return L10n.string(.liveAudioRemovedTitle)
        case "forbidden": return apiError.serverMessage ?? L10n.string(.iosLiveErrForbidden)
        default: return apiError.userFacingMessage
        }
    }

    // MARK: - Realtime
    //
    // `live-video:*` events, from `src/lib/live-video/room-service.ts`:
    //
    // participant-joined  {userId, role}
    // participant-left    {userId}
    // participant-removed {userId}
    // room-ended          {roomId}
    // role-changed        {userId, role}
    // mute-changed        {userId, isMuted}
    // camera-changed      {userId, isCameraOff}
    // you-were-removed    {roomId}
    // speaker-request     {roomId, userId}   (to host/moderators only)

    private func subscribeSocket() {
        guard socketToken == nil else { return }
        socket.connect()
        socketToken = socket.subscribe { [weak self] event in
            self?.handle(event)
        }
        // `ZrpSocket.emit` is a no-op until the socket is connected, and
        // a reconnect starts a fresh server-side socket that is in no
        // room at all - so the join is (re)sent on every connect, then
        // the detail is re-read to catch up on anything missed.
        connectToken = socket.subscribeToConnect { [weak self] in
            guard let self else { return }
            self.socket.emit("join-live-video-room", self.roomId)
            Task { await self.loadDetail() }
        }
        socket.emit("join-live-video-room", roomId)
        socketJoined = true
    }

    private func handle(_ event: SocketEvent) {
        switch event.name {
        case "live-video:participant-joined", "live-video:participant-left":
            Task { await loadDetail() }

        case "live-video:participant-removed":
            guard let payload = try? JSONDecoder().decode(LiveAudioParticipantRemovedPayload.self, from: event.data) else { return }
            if payload.userId != myUserId { Task { await loadDetail() } }

        case "live-video:role-changed":
            guard let payload = try? JSONDecoder().decode(LiveAudioRoleChangedPayload.self, from: event.data) else { return }
            Task { await loadDetail() }
            if payload.userId == myUserId {
                // Demoted to viewer: LiveKit will revoke the publish grant
                // on the fresh token anyway; turn both off locally so the
                // controls match what is actually being sent.
                if !canPublishLiveAudio(payload.role) {
                    isMicOn = false
                    isCameraOn = false
                }
                Task { await reconnectWithFreshToken() }
            }

        case "live-video:mute-changed":
            guard let payload = try? JSONDecoder().decode(LiveAudioMuteChangedPayload.self, from: event.data) else { return }
            Task { await loadDetail() }
            if payload.userId == myUserId, payload.isMuted {
                Task { try? await liveKitRoom?.localParticipant.setMicrophone(enabled: false) }
                isMicOn = false
            }

        case "live-video:camera-changed":
            guard let payload = try? JSONDecoder().decode(LiveVideoCameraChangedPayload.self, from: event.data) else { return }
            Task { await loadDetail() }
            if payload.userId == myUserId, payload.isCameraOff {
                Task {
                    try? await liveKitRoom?.localParticipant.setCamera(enabled: false)
                    refreshVideoTracks()
                }
                isCameraOn = false
            }

        case "live-video:room-ended":
            phase = .ended
            engagement.stop()
            if let activeRoom = liveKitRoom { Task { await activeRoom.disconnect() } }

        case "live-video:you-were-removed":
            phase = .removed
            engagement.stop()
            if let activeRoom = liveKitRoom { Task { await activeRoom.disconnect() } }

        case "live-video:speaker-request":
            guard let payload = try? JSONDecoder().decode(LiveAudioSpeakerRequestPayload.self, from: event.data) else { return }
            pendingJoinRequestUserIds = addPendingSpeakerRequest(pendingJoinRequestUserIds, payload.userId)

        default:
            break
        }
    }

    /// Best-effort, as on web: a role change mints new grants, so the
    /// same `Room` reconnects with a fresh token for the new role.
    private func reconnectWithFreshToken() async {
        guard let liveKitRoom else { return }
        do {
            let token = try await repository.refreshToken(roomId: roomId)
            try await liveKitRoom.connect(url: token.livekitUrl, token: token.token)
            refreshVideoTracks()
        } catch {
            // Stays on the previous grants until the next reconnect.
        }
    }

    // MARK: - Media

    /// Rebuilds the userId -> camera track map from the LiveKit room. Run
    /// on every track subscribe/unsubscribe/publish/unpublish/mute event
    /// rather than patched incrementally, so it can never drift from
    /// what LiveKit actually has.
    fileprivate func refreshVideoTracks() {
        guard let liveKitRoom else {
            videoTracks = [:]
            return
        }
        var tracks: [String: VideoTrack] = [:]
        for participant in liveKitRoom.remoteParticipants.values {
            if let identity = participant.identity?.stringValue, let track = participant.firstCameraVideoTrack {
                tracks[identity] = track
            }
        }
        let local = liveKitRoom.localParticipant
        if let identity = local.identity?.stringValue ?? myUserId, let track = local.firstCameraVideoTrack {
            tracks[identity] = track
        }
        videoTracks = tracks
    }

    func toggleMic() {
        guard let liveKitRoom, !isMicBusy, canPublish else { return }
        let turningOn = !isMicOn
        isMicBusy = true
        Task {
            let succeeded: Bool
            do {
                _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: turningOn)
                succeeded = true
            } catch {
                // Permission denied / device unavailable: the toggle
                // simply doesn't flip, matching web.
                succeeded = false
            }
            isMicBusy = false
            if succeeded { isMicOn = turningOn }
        }
    }

    func toggleCamera() {
        guard let liveKitRoom, !isCameraBusy, canPublish else { return }
        let turningOn = !isCameraOn
        if turningOn, isCameraForcedOff { return }
        isCameraBusy = true
        Task {
            let succeeded: Bool
            do {
                _ = try await liveKitRoom.localParticipant.setCamera(enabled: turningOn)
                succeeded = true
            } catch {
                succeeded = false
            }
            isCameraBusy = false
            if succeeded { isCameraOn = turningOn }
            refreshVideoTracks()
        }
    }

    /// Front/back camera, on the camera track already being published.
    func switchCamera() {
        guard
            isCameraOn,
            let track = liveKitRoom?.localParticipant.firstCameraVideoTrack as? LocalVideoTrack,
            let capturer = track.capturer as? CameraCapturer
        else { return }
        Task { _ = try? await capturer.switchCameraPosition() }
    }

    // MARK: - Join requests / moderation

    func requestToJoin() {
        Task {
            do {
                try await repository.requestToJoin(roomId: roomId)
                joinRequestSent = true
            } catch {
                actionError = roomErrorMessage(error)
            }
        }
    }

    func resolveJoinRequest(userId: String, approve: Bool) {
        actionBusyUserId = userId
        Task {
            do {
                if approve {
                    try await repository.approveJoinRequest(roomId: roomId, userId: userId)
                } else {
                    try await repository.rejectJoinRequest(roomId: roomId, userId: userId)
                }
                actionBusyUserId = nil
                pendingJoinRequestUserIds = removePendingSpeakerRequest(pendingJoinRequestUserIds, userId)
                await loadDetail()
            } catch {
                actionBusyUserId = nil
                actionError = roomErrorMessage(error)
            }
        }
    }

    func promote(userId: String) { moderate(userId) { try await self.repository.promote(roomId: self.roomId, userId: userId) } }
    func demote(userId: String) { moderate(userId) { try await self.repository.demote(roomId: self.roomId, userId: userId) } }
    func mute(userId: String) { moderate(userId) { try await self.repository.mute(roomId: self.roomId, userId: userId, muted: true) } }
    func unmute(userId: String) { moderate(userId) { try await self.repository.mute(roomId: self.roomId, userId: userId, muted: false) } }
    func forceCameraOff(userId: String) { moderate(userId) { try await self.repository.setCamera(roomId: self.roomId, userId: userId, cameraOff: true) } }
    func restoreCamera(userId: String) { moderate(userId) { try await self.repository.setCamera(roomId: self.roomId, userId: userId, cameraOff: false) } }
    func remove(userId: String) { moderate(userId) { try await self.repository.remove(roomId: self.roomId, userId: userId, reason: nil) } }

    private func moderate(_ userId: String, _ action: @escaping () async throws -> Void) {
        actionBusyUserId = userId
        Task {
            do {
                try await action()
                actionBusyUserId = nil
                await loadDetail()
            } catch {
                actionBusyUserId = nil
                actionError = roomErrorMessage(error)
            }
        }
    }

    func dismissActionError() { actionError = nil }

    func endRoom() {
        Task {
            do {
                try await repository.endRoom(id: roomId)
            } catch {
                actionError = roomErrorMessage(error)
            }
        }
    }

    // MARK: - Leave

    /// Called from the screen's `.onDisappear` (every exit path) - the
    /// real `POST /leave` happens here rather than in `deinit`, which has
    /// no task context to await a network call in.
    func leave() async {
        engagement.stop()
        if serverJoined {
            try? await repository.leaveRoom(id: roomId)
        }
        teardownLocal()
    }

    private func teardownLocal() {
        if let socketToken {
            socket.unsubscribe(socketToken)
        }
        if let connectToken {
            socket.unsubscribeFromConnect(connectToken)
        }
        if socketJoined { socket.emit("leave-live-video-room", roomId) }
        socketToken = nil
        connectToken = nil
        socketJoined = false
        if let activeRoom = liveKitRoom { Task { await activeRoom.disconnect() } }
        liveKitRoom = nil
        serverJoined = false
        videoTracks = [:]
    }

    deinit {
        // See `LiveAudioRoomViewModel.deinit`: capture the room, never
        // `self`, into a task that outlives this object.
        let room = liveKitRoom
        Task { await room?.disconnect() }
    }
}

extension LiveVideoRoomViewModel: RoomDelegate {

    nonisolated func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
        let speakingIds = Set(participants.compactMap { $0.identity?.stringValue })
        Task { @MainActor [weak self] in
            self?.speakingUserIds = speakingIds
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        scheduleTrackRefresh()
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        scheduleTrackRefresh()
    }

    nonisolated func room(_ room: Room, participant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) {
        scheduleTrackRefresh()
    }

    nonisolated func room(_ room: Room, participant: LocalParticipant, didUnpublishTrack publication: LocalTrackPublication) {
        scheduleTrackRefresh()
    }

    nonisolated func room(_ room: Room, participant: Participant, trackPublication: TrackPublication, didUpdateIsMuted isMuted: Bool) {
        scheduleTrackRefresh()
    }

    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        scheduleTrackRefresh()
    }

    private nonisolated func scheduleTrackRefresh() {
        Task { @MainActor [weak self] in
            self?.refreshVideoTracks()
        }
    }
}
