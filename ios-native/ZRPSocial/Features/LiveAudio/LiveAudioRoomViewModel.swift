import Foundation
import LiveKit

/// LISTENER < SPEAKER < MODERATOR ~= HOST - matches
/// `src/lib/live-audio/room-service.ts`'s own role checks
/// (`canPromoteSpeaker`/`isRoomAuthority`). `internal` (module-default)
/// visibility so `ZRPSocialTests` can exercise these directly.
func canPublishLiveAudio(_ role: String?) -> Bool {
    role == "HOST" || role == "MODERATOR" || role == "SPEAKER"
}

func isLiveAudioAuthority(_ role: String?) -> Bool {
    role == "HOST" || role == "MODERATOR"
}

/// Pure append-if-absent, extracted from the `live-audio:speaker-request`
/// handler for testability.
func addPendingSpeakerRequest(_ current: [String], _ userId: String) -> [String] {
    current.contains(userId) ? current : current + [userId]
}

/// Pure removal, extracted from the approve/reject-speak-request success
/// path for testability.
func removePendingSpeakerRequest(_ current: [String], _ userId: String) -> [String] {
    current.filter { $0 != userId }
}

enum LiveAudioPhase: Equatable {
    case loading
    case connecting
    case connected
    case ended
    case removed
    case error
}

/// ZRP Live Audio's room screen - ported from `src/app/live-audio/[id]/
/// page.tsx`. Room/participant state (who's in the room, roles, mutes)
/// is carried entirely by the app's existing `ZrpSocket` `live-audio:*`
/// events layered on top of a plain REST detail re-fetch on every
/// event; the LiveKit `Room` connection underneath is purely the audio
/// transport (publishing/hearing tracks) and is never consulted for
/// "who is in this room" - that would race the DB-backed truth those
/// events already carry.
///
/// Mirrors page.tsx's own `reconnectWithFreshToken()`: a role change
/// never mutates permissions on an existing LiveKit token (those are
/// baked in at mint time server-side - `mintLiveKitToken`), so a
/// role-changed event naming this user re-fetches a token for the new
/// role and reconnects the SAME `Room` instance to pick it up, rather
/// than a full teardown/rebuild.
///
/// Also matches page.tsx exactly in one deliberate way: joining a room
/// never auto-enables the microphone for anyone, including the host -
/// every participant, whatever their role, starts muted (`isMicOn ==
/// false`) and must tap unmute themselves. Audio *output* routing
/// (speaker/earpiece/Bluetooth, and the `AVAudioSession` category a raw
/// WebRTC track would otherwise need managed by hand) is handled
/// automatically by the LiveKit SDK's own audio engine; this class does
/// not duplicate that.
///
/// `NSObject` because `RoomDelegate`'s methods are `@objc optional` -
/// only `room(_:didUpdateSpeakingParticipants:)` is implemented, for the
/// same speaking-ring highlight the web room page draws
/// (`RoomEvent.ActiveSpeakersChanged` there).
@MainActor
final class LiveAudioRoomViewModel: NSObject, ObservableObject {

    @Published private(set) var phase: LiveAudioPhase = .loading
    @Published private(set) var room: LiveAudioRoom?
    @Published private(set) var participants: [LiveAudioParticipant] = []
    /// Only ever populated from `live-audio:speaker-request` events
    /// heard WHILE this screen is open (see `GET /rooms/{id}`'s own
    /// `pendingRequestCount` doc comment in `LiveAudio.swift`) - a host/
    /// moderator who opens a room that already had requests queued
    /// before they joined sees the count on the room card but not the
    /// individual ids until a new one arrives, matching page.tsx's own
    /// `pendingRequesterIds` exactly (it has the same gap).
    @Published private(set) var pendingSpeakerRequestUserIds: [String] = []
    @Published private(set) var myRole: String?
    @Published private(set) var myUserId: String?
    @Published private(set) var isMicOn = false
    @Published private(set) var isMicBusy = false
    @Published private(set) var speakingUserIds: Set<String> = []
    @Published var error: String?
    @Published var actionError: String?
    @Published private(set) var speakRequestSent = false
    @Published private(set) var actionBusyUserId: String?

    private let roomId: String
    private let repository: LiveAudioRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var liveKitRoom: LiveKit.Room?
    private var joinedSuccessfully = false

    init(
        roomId: String,
        repository: LiveAudioRepositoryProtocol = LiveAudioRepository(),
        socket: ZrpSocket? = nil
    ) {
        self.roomId = roomId
        self.repository = repository
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated (see
        // `PresenceStore`'s own identical reasoning).
        self.socket = socket ?? .shared
        super.init()
    }

    private func loadDetail() async {
        do {
            let detail = try await repository.room(id: roomId)
            room = detail.room
            participants = detail.participants
            myRole = detail.myRole
            if let myUserId {
                pendingSpeakerRequestUserIds = removePendingSpeakerRequest(pendingSpeakerRequestUserIds, myUserId)
            }
        } catch {
            // Only a failure on the very first load is fatal to the
            // screen - a transient failure on a later re-fetch
            // (triggered by some other participant's event) simply
            // leaves the last-known-good list on screen, matching
            // page.tsx's own setLoadError only ever being set from the
            // initial loadDetail() call site.
            if phase == .loading {
                self.phase = .error
                self.error = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
            }
        }
    }

    /// `currentUserId` is read once by the caller from `SessionController`
    /// and handed in, rather than this view model reaching for
    /// `SessionController` itself - it has no other reason to depend on
    /// that type.
    func connect(currentUserId: String?) async {
        guard liveKitRoom == nil, phase != .connecting else { return }
        phase = .connecting
        error = nil
        myUserId = currentUserId

        do {
            let join = try await repository.joinRoom(id: roomId)
            let liveKitRoom = LiveKit.Room(delegate: self)
            self.liveKitRoom = liveKitRoom
            try await liveKitRoom.connect(url: join.livekitUrl, token: join.token)
            joinedSuccessfully = true
            myRole = join.participant.role
            phase = .connected
            subscribeSocket()
            await loadDetail()
        } catch {
            if let failedRoom = liveKitRoom { Task { await failedRoom.disconnect() } }
            liveKitRoom = nil
            phase = .error
            self.error = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
        }
    }

    // MARK: - Realtime
    //
    // `live-audio:*` events, mirroring `src/lib/live-audio/room-
    // service.ts`'s own `emitToLiveAudioRoom`/`emitToUser` calls:
    //
    // participant-joined  {userId, role}
    // participant-left    {userId}
    // participant-removed {userId}
    // room-ended          {roomId}
    // role-changed        {userId, role}
    // mute-changed        {userId, isMuted}
    // you-were-removed    {roomId}
    // speaker-request     {roomId, userId}

    private func subscribeSocket() {
        guard socketToken == nil else { return }
        socket.connect()
        socketToken = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "live-audio:participant-joined", "live-audio:participant-left":
                Task { await self.loadDetail() }

            case "live-audio:participant-removed":
                guard let payload = try? JSONDecoder().decode(LiveAudioParticipantRemovedPayload.self, from: event.data)
                else { return }
                // My own removal is handled by the dedicated
                // you-were-removed event below, which also carries the
                // terminal-state signal participant-removed does not.
                if payload.userId != self.myUserId { Task { await self.loadDetail() } }

            case "live-audio:role-changed":
                guard let payload = try? JSONDecoder().decode(LiveAudioRoleChangedPayload.self, from: event.data)
                else { return }
                Task { await self.loadDetail() }
                if payload.userId == self.myUserId { Task { await self.reconnectWithFreshToken() } }

            case "live-audio:mute-changed":
                guard let payload = try? JSONDecoder().decode(LiveAudioMuteChangedPayload.self, from: event.data)
                else { return }
                Task { await self.loadDetail() }
                if payload.userId == self.myUserId, payload.isMuted {
                    Task { try? await self.liveKitRoom?.localParticipant.setMicrophone(enabled: false) }
                    self.isMicOn = false
                }

            case "live-audio:room-ended":
                self.phase = .ended
                if let activeRoom = self.liveKitRoom { Task { await activeRoom.disconnect() } }

            case "live-audio:you-were-removed":
                self.phase = .removed
                if let activeRoom = self.liveKitRoom { Task { await activeRoom.disconnect() } }

            case "live-audio:speaker-request":
                guard let payload = try? JSONDecoder().decode(LiveAudioSpeakerRequestPayload.self, from: event.data)
                else { return }
                self.pendingSpeakerRequestUserIds = addPendingSpeakerRequest(self.pendingSpeakerRequestUserIds, payload.userId)

            default:
                break
            }
        }
        socket.emit("join-live-audio-room", roomId)
    }

    /// Best-effort, matching page.tsx's own `reconnectWithFreshToken`:
    /// on failure the room simply stays connected on its previous
    /// grants until the next natural reconnect picks up the new token.
    private func reconnectWithFreshToken() async {
        guard let liveKitRoom else { return }
        do {
            let token = try await repository.refreshToken(roomId: roomId)
            try await liveKitRoom.connect(url: token.livekitUrl, token: token.token)
        } catch {
            // See doc comment above.
        }
    }

    // MARK: - Mic

    func toggleMic() {
        guard let liveKitRoom, !isMicBusy else { return }
        let turningOn = !isMicOn
        isMicBusy = true
        Task {
            // Permission denied or device unavailable both surface as a
            // thrown error here - caught so the toggle simply doesn't
            // flip rather than crashing, matching `toggleMic`'s own
            // try/catch on web.
            let succeeded: Bool
            do {
                _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: turningOn)
                succeeded = true
            } catch {
                succeeded = false
            }
            self.isMicBusy = false
            if succeeded { self.isMicOn = turningOn }
        }
    }

    // MARK: - Speaking / moderation

    func requestToSpeak() {
        Task {
            do {
                try await repository.requestToSpeak(roomId: roomId)
                self.speakRequestSent = true
            } catch {
                self.actionError = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
            }
        }
    }

    func resolveSpeakRequest(userId: String, approve: Bool) {
        actionBusyUserId = userId
        Task {
            do {
                if approve {
                    try await self.repository.approveSpeakRequest(roomId: self.roomId, userId: userId)
                } else {
                    try await self.repository.rejectSpeakRequest(roomId: self.roomId, userId: userId)
                }
                self.actionBusyUserId = nil
                self.pendingSpeakerRequestUserIds = removePendingSpeakerRequest(self.pendingSpeakerRequestUserIds, userId)
                await self.loadDetail()
            } catch {
                self.actionBusyUserId = nil
                self.actionError = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
            }
        }
    }

    func promote(userId: String) { moderate(userId) { try await self.repository.promote(roomId: self.roomId, userId: userId) } }
    func demote(userId: String) { moderate(userId) { try await self.repository.demote(roomId: self.roomId, userId: userId) } }
    func mute(userId: String) { moderate(userId) { try await self.repository.mute(roomId: self.roomId, userId: userId, muted: true) } }
    func unmute(userId: String) { moderate(userId) { try await self.repository.mute(roomId: self.roomId, userId: userId, muted: false) } }
    func remove(userId: String) { moderate(userId) { try await self.repository.remove(roomId: self.roomId, userId: userId, reason: nil) } }

    private func moderate(_ userId: String, _ action: @escaping () async throws -> Void) {
        actionBusyUserId = userId
        Task {
            do {
                try await action()
                self.actionBusyUserId = nil
                await self.loadDetail()
            } catch {
                self.actionBusyUserId = nil
                self.actionError = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
            }
        }
    }

    func dismissActionError() { actionError = nil }

    func endRoom() {
        Task {
            do {
                try await self.repository.endRoom(id: self.roomId)
            } catch {
                self.actionError = (error as? ApiError)?.userFacingMessage ?? L10n.string(.discoverActionFailed)
            }
        }
    }

    /// Called by the screen (still on an active `Task`) before it
    /// navigates away - the real `POST /leave` call happens here rather
    /// than from a `deinit`/teardown path, for the same reason
    /// `LiveAudioRoomViewModel`'s Android sibling documents: a class's
    /// own teardown hook is not guaranteed to still have a live task
    /// context to await a network call in.
    func leave() async {
        if joinedSuccessfully {
            try? await repository.leaveRoom(id: roomId)
        }
        teardownLocal()
    }

    private func teardownLocal() {
        if let socketToken {
            socket.unsubscribe(socketToken)
            if joinedSuccessfully { socket.emit("leave-live-audio-room", roomId) }
        }
        socketToken = nil
        if let activeRoom = liveKitRoom { Task { await activeRoom.disconnect() } }
        liveKitRoom = nil
        joinedSuccessfully = false
    }

    deinit {
        // `Room.disconnect()` is `async` with no synchronous or
        // fire-and-forget variant, so it can't be awaited directly from
        // a synchronous `deinit`. Capture the room itself (not `self`,
        // which must never be referenced from inside `deinit`) into the
        // spawned `Task` so teardown runs to completion independently of
        // this view model's own lifetime - matching `ZrpSocket.disconnect()`'s
        // own fire-and-forget teardown shape.
        let room = liveKitRoom
        Task { await room?.disconnect() }
    }
}

extension LiveAudioRoomViewModel: RoomDelegate {
    nonisolated func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
        let speakingIds = Set(participants.compactMap { $0.identity?.stringValue })
        Task { @MainActor [weak self] in
            self?.speakingUserIds = speakingIds
        }
    }
}
