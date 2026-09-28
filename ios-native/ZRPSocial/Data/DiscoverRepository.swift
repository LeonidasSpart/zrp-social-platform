import Foundation

/// ZRP Discover - a server-ranked, TikTok-style vertical video feed
/// (`GET /api/discover`), distinct from Search's own "Discover"
/// pre-search state (suggested users/trending hashtags) - a different
/// backend concern entirely, despite the shared name.
///
/// Like/repost/save/follow/mute/block all reuse the exact same routes
/// every other screen in this app already calls - built here directly
/// against `ApiClient` (the same routes `PostsRepository`,
/// `UsersRepository`, and `SettingsRepository` call) rather than by
/// depending on those repository types, so this stays one small,
/// self-contained, independently mockable surface, matching how no
/// other screen in this app shares a `FollowButton`-style abstraction
/// either - each screen calls the same underlying route on its own.
/// Reporting is not one of these: `ReportSheet` (see
/// `DataExportView.swift`) owns its own `SettingsRepository` and
/// submits itself, so a Discover item is reported the same way as
/// everywhere else in this app - `ReportSheet(target: .post(item.id))`
/// as a sheet, with nothing for this repository to do.
protocol DiscoverRepositoryProtocol: Sendable {
    func feed(cursor: String?) async throws -> DiscoverPage
    func recordEvent(postId: String, eventType: DiscoverEventType, watchedMs: Int?) async
    func markNotInterested(postId: String) async throws -> Bool
    func toggleLike(postId: String) async throws -> Bool
    func toggleRepost(postId: String) async throws -> Bool
    func toggleSave(postId: String) async throws -> Bool
    func toggleFollow(username: String) async throws -> FollowToggleResponse
    func muteCreator(userId: String) async throws -> Bool
    func blockCreator(username: String) async throws -> Bool
}

struct DiscoverRepository: DiscoverRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `limit` is left to the route's own default (20, capped at 50 -
    /// `src/lib/discover/feed.ts`), same as every current caller.
    func feed(cursor: String?) async throws -> DiscoverPage {
        try await client.send(Endpoint.get("discover", query: [("cursor", cursor)]))
    }

    /// Analytics only - deliberately silent on failure, the same stance
    /// `PostInteractionStore.countView` takes for `POST /api/posts/{id}/
    /// view`: a watch-event signal must never interrupt playback, and
    /// the route itself answers `{recorded: false}` with a 200 rather
    /// than an error for anything it could not record.
    func recordEvent(postId: String, eventType: DiscoverEventType, watchedMs: Int?) async {
        do {
            let request = DiscoverEventRequest(postId: postId, eventType: eventType, watchedMs: watchedMs)
            let _: DiscoverEventResponse = try await client.send(try Endpoint.post("discover/events", body: request))
        } catch {
            // See the doc comment above - never surfaced.
        }
    }

    func markNotInterested(postId: String) async throws -> Bool {
        let response: DiscoverNotInterestedResponse = try await client.send(
            try Endpoint.post("discover/not-interested", body: DiscoverNotInterestedRequest(postId: postId))
        )
        return response.dismissed
    }

    func toggleLike(postId: String) async throws -> Bool {
        let response: LikeResponse = try await client.send(Endpoint.post("posts/\(Endpoint.segment(postId))/like"))
        return response.liked
    }

    func toggleRepost(postId: String) async throws -> Bool {
        let response: RepostResponse = try await client.send(Endpoint.post("posts/\(Endpoint.segment(postId))/repost"))
        return response.reposted
    }

    func toggleSave(postId: String) async throws -> Bool {
        let response: BookmarkResponse = try await client.send(Endpoint.post("posts/\(Endpoint.segment(postId))/bookmark"))
        return response.bookmarked
    }

    func toggleFollow(username: String) async throws -> FollowToggleResponse {
        try await client.send(Endpoint.post("users/\(Endpoint.segment(username))/follow"))
    }

    /// Unlike block, this route takes a **user id** in a JSON body
    /// rather than a username in the path (`SettingsRepository`'s own
    /// `toggleMute` does the same).
    func muteCreator(userId: String) async throws -> Bool {
        struct Request: Encodable { let userId: String }
        struct Response: Decodable { let muted: Bool }
        let response: Response = try await client.send(try Endpoint.post("users/mute", body: Request(userId: userId)))
        return response.muted
    }

    func blockCreator(username: String) async throws -> Bool {
        struct Response: Decodable { let blocked: Bool }
        let response: Response = try await client.send(Endpoint.post("users/\(Endpoint.segment(username))/block"))
        return response.blocked
    }
}
