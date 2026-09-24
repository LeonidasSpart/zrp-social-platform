import Foundation

/// One notification.
///
/// `GET /api/notifications` returns a bare array of the 50 most recent,
/// newest first, each with its `fromUser` and - when the notification is
/// about a post - a two-field `post` reference. There is no pagination,
/// and 50 is the hard cap, so the screen offers no "load more".
struct AppNotification: Decodable, Identifiable, Equatable {
    let id: String

    /// A free-form string in the schema. `NotificationKind` maps the ones
    /// that have real copy; anything else is rendered without an action
    /// phrase, which is exactly what the website does with an
    /// unrecognised type rather than guessing at wording.
    let type: String
    let read: Bool
    let createdAt: Date
    let fromUser: PostAuthor?
    let post: NotificationPostRef?
    /// Set only on a "comment"/"reply" notification - the exact comment
    /// or reply that triggered it, so a tap can jump straight to it
    /// instead of opening the post at the top of its comment list.
    let commentId: String?

    var kind: NotificationKind { NotificationKind(rawValue: type) ?? .unknown }
}

/// The post a notification points at - id and content only, which is all
/// the route selects.
struct NotificationPostRef: Decodable, Identifiable, Equatable {
    let id: String
    let content: String
}

/// The notification types that have real, translated copy.
///
/// Deliberately only the nine the website itself renders. `src/lib/notifications.ts`
/// declares a far wider union - ticket, opportunity, help, play and music
/// events among them - but the website's own notifications page returns
/// an empty action phrase for every one of those, so inventing wording
/// for them here would be inventing product copy that exists nowhere
/// else. They still appear in the list, attributed and timestamped, just
/// without a verb.
enum NotificationKind: String {
    case like
    case comment
    case reply
    case follow
    /// Distinct from `.follow`: this follow completed a mutual
    /// relationship (the recipient already followed the actor back
    /// before this event) - the notification says "followed you back"
    /// instead of the generic "started following you". See the web
    /// follow route's own mutual-follow check for why this needs to be
    /// a distinct type rather than a client-side guess: the client has
    /// no reliable way to know the relationship was already mutual at
    /// the moment this notification was created.
    case followBack = "follow_back"
    case followRequest = "follow_request"
    case repost
    case message
    case appealResolved = "appeal_resolved"
    case listingApproved = "listing_approved"
    case listingRejected = "listing_rejected"
    case listingRemoved = "listing_removed"
    case unknown

    /// The action phrase shown after the actor's name, or `nil` when the
    /// type has none - matching the website exactly.
    var actionKey: L10nKey? {
        switch self {
        case .like: return .notificationsLikedPostSuffix
        case .comment: return .notificationsCommentedPostSuffix
        case .reply: return .notificationsRepliedCommentSuffix
        case .follow: return .notificationsStartedFollowingSuffix
        case .followBack: return .notificationsFollowedYouBackSuffix
        case .followRequest: return .iosNotificationsFollowRequestSuffix
        case .repost: return .notificationsRepostedPostSuffix
        case .message: return .iosNotificationsMessageSuffix
        case .appealResolved: return .notificationsAppealResolvedSuffix
        case .listingApproved: return .notificationsListingApprovedSuffix
        case .listingRejected: return .notificationsListingRejectedSuffix
        case .listingRemoved: return .notificationsListingRemovedSuffix
        case .unknown: return nil
        }
    }

    var systemImage: String {
        switch self {
        case .like: return "heart.fill"
        case .comment, .reply: return "bubble.left.fill"
        case .follow, .followBack, .followRequest: return "person.badge.plus"
        case .repost: return "arrow.2.squarepath"
        case .message: return "envelope.fill"
        case .appealResolved: return "scalemass"
        case .listingApproved, .listingRejected, .listingRemoved: return "storefront"
        case .unknown: return "bell"
        }
    }
}

/// `PUT /api/notifications` -> `{success}`.
struct MarkAllReadResponse: Decodable {
    let success: Bool
}
