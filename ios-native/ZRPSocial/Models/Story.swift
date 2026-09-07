import Foundation

/// One story.
///
/// `GET /api/stories` builds these itself rather than returning raw rows,
/// so the shape here is exactly what that handler emits - including the
/// per-viewer `viewed` and `liked` flags it derives from the caller's own
/// view/like rows. Both are always present (the route requires a
/// session), so neither is optional the way the feed's `liked` is.
struct Story: Decodable, Identifiable, Equatable {
    let id: String
    let content: String?
    let mediaUrl: String?

    /// `"image"` or `"video"` - the create route rejects anything else
    /// when media is attached.
    let mediaType: String?
    let createdAt: Date

    /// These four are `var` so the rail can reflect a view or a like the
    /// moment it happens, without refetching the whole rail. Everything
    /// else about a story is immutable once created.
    var viewed: Bool
    var viewCount: Int
    var liked: Bool
    var likeCount: Int

    var isVideo: Bool { mediaType?.lowercased() == "video" }
}

/// A user and their unexpired stories.
///
/// The route groups by author and returns a **bare JSON array** of these -
/// no envelope, no pagination. It only ever contains the viewer and the
/// accounts they follow, and only stories whose `expiresAt` is still in
/// the future, so expiry needs no client-side handling: an expired story
/// simply stops being returned.
struct StoryGroup: Decodable, Identifiable, Equatable {
    let user: StoryAuthor
    var stories: [Story]

    var id: String { user.id }

    /// True once every story in the group has been seen, which is what
    /// dims the ring on the rail.
    var isFullyViewed: Bool { stories.allSatisfy(\.viewed) }

    /// Where the viewer should be dropped in when opening this group -
    /// the first unseen story, or the start if all have been seen.
    var firstUnviewedIndex: Int {
        stories.firstIndex(where: { !$0.viewed }) ?? 0
    }
}

/// The author summary the stories route selects.
///
/// Deliberately its own type rather than `PostAuthor`: this route selects
/// only id, username, name and avatarUrl - there is no `badgeType`, so a
/// verified badge cannot be rendered on the rail without inventing data
/// the endpoint does not return.
struct StoryAuthor: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?

    var displayName: String { name?.isEmpty == false ? name! : username }
}

/// `POST /api/stories/{id}/like` -> `{liked}`.
struct StoryLikeResponse: Decodable {
    let liked: Bool
}
