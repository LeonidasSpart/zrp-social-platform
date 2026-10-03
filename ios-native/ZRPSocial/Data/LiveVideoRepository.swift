import Foundation

/// The real REST contract under `src/app/api/live-video/rooms/` - a
/// structural mirror of `LiveAudioRepository`, plus the one route Live
/// Audio has no equivalent for (`POST .../camera`). Every method lets the
/// server's own typed error (`{error, code}`) surface through `ApiError`
/// so a host or viewer is told exactly what happened.
protocol LiveVideoRepositoryProtocol: Sendable {
    func rooms(cursor: String?) async throws -> LiveVideoRoomsPage
    func createRoom(_ request: CreateLiveAudioRoomRequest) async throws -> LiveAudioRoom
    func room(id: String) async throws -> LiveVideoRoomDetail
    func joinRoom(id: String) async throws -> LiveAudioJoinResponse
    func refreshToken(roomId: String) async throws -> LiveAudioTokenResponse
    func leaveRoom(id: String) async throws
    func endRoom(id: String) async throws
    func startRoom(id: String) async throws -> LiveAudioRoom
    func cancelRoom(id: String) async throws
    func promote(roomId: String, userId: String) async throws
    func demote(roomId: String, userId: String) async throws
    func mute(roomId: String, userId: String, muted: Bool) async throws
    func setCamera(roomId: String, userId: String, cameraOff: Bool) async throws
    func remove(roomId: String, userId: String, reason: String?) async throws
    func requestToJoin(roomId: String) async throws
    func approveJoinRequest(roomId: String, userId: String) async throws
    func rejectJoinRequest(roomId: String, userId: String) async throws
}

struct LiveVideoRepository: LiveVideoRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// Works signed-out for PUBLIC rooms, same as Live Audio's list.
    func rooms(cursor: String?) async throws -> LiveVideoRoomsPage {
        try await client.send(Endpoint.get("live-video/rooms", query: [("cursor", cursor)]))
    }

    func createRoom(_ request: CreateLiveAudioRoomRequest) async throws -> LiveAudioRoom {
        let response: CreateLiveAudioRoomResponse = try await client.send(
            try Endpoint.post("live-video/rooms", body: request)
        )
        return response.room
    }

    func room(id: String) async throws -> LiveVideoRoomDetail {
        try await client.send(Endpoint.get("live-video/rooms/\(Endpoint.segment(id))"))
    }

    func joinRoom(id: String) async throws -> LiveAudioJoinResponse {
        try await client.send(Endpoint.post("live-video/rooms/\(Endpoint.segment(id))/join"))
    }

    func refreshToken(roomId: String) async throws -> LiveAudioTokenResponse {
        try await client.send(Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/token"))
    }

    func leaveRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-video/rooms/\(Endpoint.segment(id))/leave"))
    }

    func endRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-video/rooms/\(Endpoint.segment(id))/end"))
    }

    func startRoom(id: String) async throws -> LiveAudioRoom {
        let response: CreateLiveAudioRoomResponse = try await client.send(
            Endpoint.post("live-video/rooms/\(Endpoint.segment(id))/start")
        )
        return response.room
    }

    func cancelRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-video/rooms/\(Endpoint.segment(id))/cancel"))
    }

    /// Viewer (LISTENER) -> on camera (SPEAKER).
    func promote(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/promote", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func demote(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/demote", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func mute(roomId: String, userId: String, muted: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/mute", body: LiveAudioMuteRequest(userId: userId, muted: muted))
        )
    }

    /// Moderator-forced camera off/on for someone else. A participant's
    /// own camera toggle is a LiveKit `setCamera(enabled:)` call and never
    /// reaches this route (see the route's own comment).
    func setCamera(roomId: String, userId: String, cameraOff: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "live-video/rooms/\(Endpoint.segment(roomId))/camera",
                body: LiveVideoCameraRequest(userId: userId, cameraOff: cameraOff)
            )
        )
    }

    func remove(roomId: String, userId: String, reason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/remove", body: LiveAudioRemoveRequest(userId: userId, reason: reason))
        )
    }

    /// "Request to join on camera" - the server names these join requests
    /// but serves them from the same `speak/*` paths as Live Audio.
    func requestToJoin(roomId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/speak/request"))
    }

    func approveJoinRequest(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/speak/approve", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func rejectJoinRequest(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-video/rooms/\(Endpoint.segment(roomId))/speak/reject", body: LiveAudioUserIdRequest(userId: userId))
        )
    }
}
