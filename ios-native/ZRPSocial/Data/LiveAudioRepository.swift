import Foundation

/// Wraps the real REST contract every Live Audio route enforces
/// server-side (plan gate, role authority, room-state validity - see
/// `LiveAudio.swift`'s own doc comment). Every method lets the server's
/// own specific error surface through `ApiError` rather than a generic
/// failure, since these are exactly the messages a host/listener needs
/// to understand what just happened in a live room.
protocol LiveAudioRepositoryProtocol: Sendable {
    func rooms(cursor: String?) async throws -> LiveAudioRoomsPage
    func createRoom(_ request: CreateLiveAudioRoomRequest) async throws -> LiveAudioRoom
    func room(id: String) async throws -> LiveAudioRoomDetail
    func joinRoom(id: String) async throws -> LiveAudioJoinResponse
    func refreshToken(roomId: String) async throws -> LiveAudioTokenResponse
    func leaveRoom(id: String) async throws
    func endRoom(id: String) async throws
    func startRoom(id: String) async throws -> LiveAudioRoom
    func cancelRoom(id: String) async throws
    func promote(roomId: String, userId: String) async throws
    func demote(roomId: String, userId: String) async throws
    func mute(roomId: String, userId: String, muted: Bool) async throws
    func remove(roomId: String, userId: String, reason: String?) async throws
    func requestToSpeak(roomId: String) async throws
    func approveSpeakRequest(roomId: String, userId: String) async throws
    func rejectSpeakRequest(roomId: String, userId: String) async throws
}

struct LiveAudioRepository: LiveAudioRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// Works signed-out for PUBLIC rooms, same as `GET /api/videos` and
    /// `GET /api/discover`.
    func rooms(cursor: String?) async throws -> LiveAudioRoomsPage {
        try await client.send(Endpoint.get("live-audio/rooms", query: [("cursor", cursor)]))
    }

    func createRoom(_ request: CreateLiveAudioRoomRequest) async throws -> LiveAudioRoom {
        let response: CreateLiveAudioRoomResponse = try await client.send(
            try Endpoint.post("live-audio/rooms", body: request)
        )
        return response.room
    }

    func room(id: String) async throws -> LiveAudioRoomDetail {
        try await client.send(Endpoint.get("live-audio/rooms/\(Endpoint.segment(id))"))
    }

    func joinRoom(id: String) async throws -> LiveAudioJoinResponse {
        try await client.send(Endpoint.post("live-audio/rooms/\(Endpoint.segment(id))/join"))
    }

    func refreshToken(roomId: String) async throws -> LiveAudioTokenResponse {
        try await client.send(Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/token"))
    }

    func leaveRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-audio/rooms/\(Endpoint.segment(id))/leave"))
    }

    func endRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-audio/rooms/\(Endpoint.segment(id))/end"))
    }

    func startRoom(id: String) async throws -> LiveAudioRoom {
        let response: CreateLiveAudioRoomResponse = try await client.send(
            Endpoint.post("live-audio/rooms/\(Endpoint.segment(id))/start")
        )
        return response.room
    }

    func cancelRoom(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-audio/rooms/\(Endpoint.segment(id))/cancel"))
    }

    /// Host/moderator invites a listener directly to speak (no prior
    /// raised hand).
    func promote(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/promote", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func demote(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/demote", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func mute(roomId: String, userId: String, muted: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/mute", body: LiveAudioMuteRequest(userId: userId, muted: muted))
        )
    }

    func remove(roomId: String, userId: String, reason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/remove", body: LiveAudioRemoveRequest(userId: userId, reason: reason))
        )
    }

    func requestToSpeak(roomId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/speak/request"))
    }

    func approveSpeakRequest(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/speak/approve", body: LiveAudioUserIdRequest(userId: userId))
        )
    }

    func rejectSpeakRequest(roomId: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("live-audio/rooms/\(Endpoint.segment(roomId))/speak/reject", body: LiveAudioUserIdRequest(userId: userId))
        )
    }
}
