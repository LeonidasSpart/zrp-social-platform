import Foundation

/// One `GET /api/discover` item - `src/lib/discover/types.ts`'s own
/// `DiscoverFeedItem`. Deliberately its own type rather than `Post`:
/// the route returns a flattened, purpose-built shape (a subset of
/// `Post`'s fields, renamed and regrouped for this one feed), so
/// force-fitting it into `Post` would mean either a `Post` that lies
/// about which fields a Discover response actually carries, or a
/// second decoding path for the same type depending on the route. Its
/// `audio` field is modeled on web for a future feature but is always
/// null today, so it is not ported here at all - there is nothing to
/// do with a value that can only ever be null.
struct DiscoverItem: Decodable, Identifiable, Equatable {
    let id: String
    let author: DiscoverAuthor
    let media: DiscoverMedia
    let caption: String
    var stats: DiscoverStats
    var viewerState: DiscoverViewerState
    let commentsEnabled: Bool
    let createdAt: Date
    /// `"recent"` | `"popular"` - the real, honest ranking reason
    /// (`DiscoverRankingService.getDiscoverReason`) shown by the "Why am
    /// I seeing this?" affordance. Never a fabricated personalization
    /// claim - the ranking service has no follow/watch-history signal
    /// to honestly claim either of those yet.
    let reason: String
    /// Present only when premium-gated content redacted this item -
    /// same shape `applyPremiumGating` attaches everywhere else on web
    /// (`src/lib/premium-content.ts`).
    let premiumPost: DiscoverPremiumPost?
}

struct DiscoverAuthor: Decodable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?

    var displayName: String { name ?? username }
}

/// `url` is nil only for a locked, unpurchased premium item - see
/// `DiscoverPremiumPost`.
struct DiscoverMedia: Decodable, Equatable {
    let url: String?
    let type: String
}

struct DiscoverStats: Decodable, Equatable {
    var likes: Int
    var comments: Int
    var reposts: Int
    var saves: Int
    var views: Int
}

struct DiscoverViewerState: Decodable, Equatable {
    var liked: Bool
    var saved: Bool
    var reposted: Bool
    var followsAuthor: Bool
}

/// This app has never built a purchase flow for any feature - tips,
/// plan upgrades, HELP contributions, or a premium post - since every
/// request it sends carries `x-zrp-native-app`, and the corresponding
/// server routes refuse it outright (Apple 3.1.1; see this app's own
/// store-policy notes). `GET /api/discover` is the first route that can
/// hand this app a locked item at all, and the same rule applies here:
/// a real, honest preview (`previewContent`, `price`, `currency`) with
/// a plain link to the post's own detail screen - not a purchase
/// button, and not a dead-end "Unlock" CTA either.
struct DiscoverPremiumPost: Decodable, Equatable {
    let id: String
    let price: Double
    let currency: String
    let previewContent: String
    let locked: Bool
}

struct DiscoverPage: Decodable {
    let items: [DiscoverItem]
    let nextCursor: String?
}

/// The same watch-event family `src/lib/discover-watch-client.ts`'s own
/// `DiscoverWatchEventType` enumerates (`prisma/schema.prisma`'s
/// `DiscoverEventType`) - raw values are the wire values verbatim.
enum DiscoverEventType: String, Encodable {
    case impression = "IMPRESSION"
    case start = "START"
    case progress25 = "PROGRESS_25"
    case progress50 = "PROGRESS_50"
    case progress75 = "PROGRESS_75"
    case complete = "COMPLETE"
    case skip = "SKIP"
}

struct DiscoverEventRequest: Encodable {
    let postId: String
    let eventType: DiscoverEventType
    let watchedMs: Int?
}

/// `recorded: false` is not an error (e.g. deduped, or the post no
/// longer qualifies) - it just means nothing new was written. See
/// `POST /api/discover/events`'s own doc comment.
struct DiscoverEventResponse: Decodable {
    let recorded: Bool
}

struct DiscoverNotInterestedRequest: Encodable {
    let postId: String
}

struct DiscoverNotInterestedResponse: Decodable {
    let dismissed: Bool
}

/// One row from `GET /api/discover/people` ("people near you") -
/// `src/app/api/discover/people/route.ts`'s own select. Deliberately its
/// own type rather than `PostAuthor`: this route's `where` clause
/// matches only on the viewer's own `countryCode` field - there is no
/// GPS/device-location capability anywhere in this codebase (see
/// `docs/user-geography-and-acquisition.md`'s own "Known limitations") -
/// so the extra profile fields (bio/category/headline/company) exist so
/// the UI can caption a row with something more specific than "nearby",
/// which would otherwise misleadingly imply real proximity.
struct NearbyUser: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?
    let bio: String?
    let category: String?
    let headline: String?
    let company: String?

    var displayName: String { name?.isEmpty == false ? name! : username }
    var handle: String { "@\(username)" }
}

/// `reason` is only ever `"unknown_viewer_country"` - the viewer has no
/// `countryCode` on file, so the server honestly returns an empty result
/// rather than guessing. Absent on an ordinary page.
struct NearbyPeoplePage: Decodable {
    let users: [NearbyUser]
    let nextCursor: String?
    let reason: String?
}
