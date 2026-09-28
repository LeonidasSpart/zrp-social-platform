import Foundation

/// ZRP Live Audio - a LiveKit-backed audio room feature (Twitter Spaces/
/// Clubhouse-style), paid-gated to pro/business/enterprise plans
/// server-side (`src/lib/live-audio/entitlement.ts` - `liveAudio` in
/// `limits.ts`). Every route requires a signed-in session
/// (`withLiveAudioAuth` wraps `requireActiveUser()`) except the
/// discovery list, which also works signed out for PUBLIC rooms.
///
/// Real-time room state (participants joining/leaving, role/mute
/// changes, the room ending, a speak request) arrives over the app's
/// existing app-wide `ZrpSocket` as `live-audio:*` events - see
/// `LiveAudioRoomViewModel`'s own doc comment for the exact event
/// contract, which mirrors `src/lib/live-audio/room-service.ts`'s own
/// `emitToLiveAudioRoom`/`emitToUser` calls verbatim. These REST routes
/// never need polling once a room's socket channel is joined.

struct LiveAudioHost: Decodable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?

    var displayName: String { name ?? username }
}

struct LiveAudioCommunitySummary: Decodable, Equatable {
    let id: String
    let name: String
    let slug: String
}

/// One `GET /live-audio/rooms` row - the discovery list.
struct LiveAudioRoomSummary: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let category: String?
    /// `"PUBLIC"` | `"COMMUNITY"` | `"PRIVATE"`
    let visibility: String
    let startedAt: Date?
    let host: LiveAudioHost
    let community: LiveAudioCommunitySummary?
    let listenerCount: Int
}

struct LiveAudioRoomsPage: Decodable {
    let rooms: [LiveAudioRoomSummary]
    let nextCursor: String?
}

/// The raw Prisma row returned by create/detail/start -
/// `src/lib/live-audio/room-service.ts`.
struct LiveAudioRoom: Decodable, Equatable {
    let id: String
    let hostId: String
    let communityId: String?
    let title: String
    let description: String?
    let category: String?
    /// `"SCHEDULED"` | `"LIVE"` | `"ENDED"` | `"CANCELLED"`
    let status: String
    let visibility: String
    let scheduledAt: Date?
    let startedAt: Date?
    let endedAt: Date?
    let createdAt: Date
    let updatedAt: Date
}

struct CreateLiveAudioRoomResponse: Decodable {
    let room: LiveAudioRoom
}

struct CreateLiveAudioRoomRequest: Encodable {
    let title: String
    let description: String?
    let category: String?
    /// `"PUBLIC"` | `"COMMUNITY"` | `"PRIVATE"`
    let visibility: String
    let communityId: String?
    /// ISO date string - a future value creates a SCHEDULED room
    /// instead of one that's LIVE immediately. Not offered from this
    /// app's own create form (see `LiveAudioListView`'s doc comment),
    /// matching the web composer's own choice, but the field is still
    /// declared since the route accepts it.
    let scheduledAt: String?
}

/// One entry in a room's participant list - `GET /live-audio/rooms/{id}`.
struct LiveAudioParticipant: Decodable, Equatable {
    /// `"HOST"` | `"MODERATOR"` | `"SPEAKER"` | `"LISTENER"`
    let role: String
    let isMuted: Bool
    let joinedAt: Date
    let user: LiveAudioHost
}

struct LiveAudioRoomDetail: Decodable {
    let room: LiveAudioRoom
    let participants: [LiveAudioParticipant]
    /// Only nonzero for the caller when they're HOST/MODERATOR - never
    /// trust this as "there ARE no requests" if 0 and not room
    /// authority, the server simply always reports 0 to non-authority
    /// callers.
    let pendingRequestCount: Int
    /// `"HOST"` | `"MODERATOR"` | `"SPEAKER"` | `"LISTENER"` | `nil` -
    /// `nil` means the caller isn't (or is no longer) a participant.
    let myRole: String?
}

/// `POST /live-audio/rooms/{id}/join` - real-time connection to be
/// minted via `Room.connect(url:token:)`.
struct LiveAudioJoinParticipant: Decodable {
    let role: String
}

struct LiveAudioJoinResponse: Decodable {
    let participant: LiveAudioJoinParticipant
    let token: String
    let livekitUrl: String
}

/// `POST /live-audio/rooms/{id}/token` - reissue for the caller's
/// CURRENT role (call after a role-changed event affecting them, or on
/// reconnect).
struct LiveAudioTokenResponse: Decodable {
    let token: String
    let livekitUrl: String
}

struct LiveAudioUserIdRequest: Encodable {
    let userId: String
}

struct LiveAudioMuteRequest: Encodable {
    let userId: String
    let muted: Bool
}

struct LiveAudioRemoveRequest: Encodable {
    let userId: String
    let reason: String?
}

// MARK: - Real-time (`live-audio:*` Socket.IO events,
// `src/lib/live-audio/room-service.ts`'s own emitToLiveAudioRoom/
// emitToUser calls)

struct LiveAudioParticipantJoinedPayload: Decodable {
    let userId: String
    let role: String
}

struct LiveAudioParticipantLeftPayload: Decodable {
    let userId: String
}

struct LiveAudioParticipantRemovedPayload: Decodable {
    let userId: String
}

struct LiveAudioRoomEndedPayload: Decodable {
    let roomId: String
}

struct LiveAudioRoleChangedPayload: Decodable {
    let userId: String
    let role: String
}

struct LiveAudioMuteChangedPayload: Decodable {
    let userId: String
    let isMuted: Bool
}

struct LiveAudioYouWereRemovedPayload: Decodable {
    let roomId: String
}

struct LiveAudioSpeakerRequestPayload: Decodable {
    let roomId: String
    let userId: String
}
