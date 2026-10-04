import Foundation

/// ZRP Live Video - the camera-tile sibling of Live Audio, served by
/// `src/lib/live-video/room-service.ts`, which is a direct structural
/// mirror of the Live Audio state machine: the same HOST/MODERATOR/
/// SPEAKER/LISTENER roles, the same SCHEDULED -> LIVE -> ENDED/CANCELLED
/// lifecycle, the same LiveKit token minting (`mintLiveKitToken`, whose
/// `canPublish` grant already covers camera and microphone tracks) and
/// the same plan gate (`requireLiveVideoAccess`, `liveVideo` in `PLANS`).
///
/// The one genuine difference is media: an on-camera participant
/// publishes a camera track alongside the microphone, and a host/
/// moderator can force that camera off independently of mute
/// (`POST .../camera`, `isCameraOff`). Every shape that is byte-for-byte
/// identical to Live Audio's is reused from `LiveAudio.swift` instead of
/// being declared twice: the raw room row (`LiveAudioRoom`), host/
/// community summaries, the create request/response, and the join/token
/// responses.
///
/// Real-time state arrives over the app-wide `ZrpSocket` as
/// `live-video:*` events once the `live-video:{roomId}` channel is joined
/// (`join-live-video-room`, `server.js`) - see `LiveVideoRoomViewModel`.

/// One `GET /live-video/rooms` row. Same as Live Audio's discovery row,
/// except the live count is `viewerCount` (every active participant)
/// rather than `listenerCount`.
struct LiveVideoRoomSummary: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let category: String?
    /// `"PUBLIC"` | `"COMMUNITY"` | `"PRIVATE"`
    let visibility: String
    let startedAt: Date?
    let host: LiveAudioHost
    let community: LiveAudioCommunitySummary?
    let viewerCount: Int
}

struct LiveVideoRoomsPage: Decodable {
    let rooms: [LiveVideoRoomSummary]
    let nextCursor: String?
}

/// One entry in a room's participant list - `GET /live-video/rooms/{id}`.
struct LiveVideoParticipant: Decodable, Equatable {
    /// `"HOST"` | `"MODERATOR"` | `"SPEAKER"` | `"LISTENER"`
    let role: String
    let isMuted: Bool
    /// Moderator-forced camera off. Independent of whether the
    /// participant has simply not turned their camera on yet - that is a
    /// LiveKit track state, not a database flag, which is why a tile
    /// always falls back to the avatar when no video track is subscribed.
    let isCameraOff: Bool
    let joinedAt: Date
    let user: LiveAudioHost
}

struct LiveVideoRoomDetail: Decodable {
    let room: LiveAudioRoom
    let participants: [LiveVideoParticipant]
    /// Only nonzero for a HOST/MODERATOR caller - see Live Audio's own
    /// identical field.
    let pendingRequestCount: Int
    /// `nil` when the caller is not (or no longer) an active participant.
    let myRole: String?
}

/// `POST /live-video/rooms/{id}/camera` - `cameraOff: false` explicitly
/// restores a camera a moderator previously forced off.
struct LiveVideoCameraRequest: Encodable {
    let userId: String
    let cameraOff: Bool
}

// MARK: - Real-time (`live-video:*`)

/// `live-video:camera-changed` - the only `live-video:*` event with no
/// `live-audio:*` counterpart. Every other event payload is identical to
/// Live Audio's and decodes with those types.
struct LiveVideoCameraChangedPayload: Decodable {
    let userId: String
    let isCameraOff: Bool
}
