import Foundation

// MARK: - Shared

/// A minimal reference to a user, exactly as every `/api/admin/**` route
/// nests it inside its own payload (`select: { id, username, name }`).
/// Never the full `UserProfile` - these routes never send one, and this
/// app has no business inflating a three-field reference into a request
/// for a profile nobody asked to view.
struct AdminActorRef: Decodable, Equatable {
    let id: String
    let username: String
    let name: String?

    var displayName: String { name?.isEmpty == false ? name! : username }
}

// MARK: - Dashboard (`/api/admin/stats`)

/// `GET /api/admin/stats` - staff. Platform-wide counts for the hub
/// screen's stat grid, the same numbers Android's `AdminDashboardScreen`
/// shows.
struct AdminStats: Decodable, Equatable {
    let users: Int
    let posts: Int
    let comments: Int
    let reports: Int
    let pendingReports: Int
    let roleCounts: [String: Int]

    var admins: Int { roleCounts["ADMIN"] ?? 0 }
    var moderators: Int { roleCounts["MODERATOR"] ?? 0 }
}

// MARK: - Users (`/api/admin/users`)

/// One row of `GET /api/admin/users`.
///
/// `isAdmin` is decoded but never edited here - `PUT .../users/[id]`
/// keeps it "for compatibility" alongside the real `role` field, and a
/// second control that means almost the same thing as the role picker
/// would just be confusing. `role` is the one this screen writes.
struct AdminUserSummary: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let email: String?
    let createdAt: Date
    let isAdmin: Bool
    let role: String
    let badgeType: String?
    let plan: String?
    let banned: Bool
    let counts: AdminUserCounts

    var displayName: String { name?.isEmpty == false ? name! : username }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, email, createdAt, isAdmin, role, badgeType, plan, banned
        case counts = "_count"
    }
}

struct AdminUserCounts: Decodable, Equatable {
    let posts: Int
    let comments: Int
    let reports: Int
}

/// The stat cards on the web page - always computed against the search
/// term alone, never the role/badge/status filters, so they read as a
/// stable overview rather than jumping around as filters change.
struct AdminUserStats: Decodable, Equatable {
    let total: Int
    let active: Int
    let banned: Int
    let admins: Int
    let mods: Int
}

struct AdminUsersPage: Decodable {
    let users: [AdminUserSummary]
    let total: Int
    let page: Int
    let totalPages: Int
    let stats: AdminUserStats
}

/// `role=` query value. `journalist` is a valid **filter** even though it
/// is not a settable role from this screen (see `AdminAssignableRole`) -
/// the route's own `roleFilter` accepts it unmodified as a `Role` enum
/// value.
enum AdminRoleFilter: String, CaseIterable, Identifiable {
    case all = "ALL"
    case user = "USER"
    case moderator = "MODERATOR"
    case admin = "ADMIN"
    case journalist = "JOURNALIST"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All roles"
        case .user: return "User"
        case .moderator: return "Moderator"
        case .admin: return "Admin"
        case .journalist: return "Journalist"
        }
    }
}

/// `badge=` query value. `NONE` means "no badge at all", distinct from
/// `ALL` meaning "don't filter" - the route maps `NONE` to `badgeType: null`.
enum AdminBadgeFilter: String, CaseIterable, Identifiable {
    case all = "ALL"
    case none = "NONE"
    case verified
    case organization
    case government
    case team

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All badges"
        case .none: return "No badge"
        case .verified: return "Verified"
        case .organization: return "Organization"
        case .government: return "Government"
        case .team: return "ZRP Team"
        }
    }
}

enum AdminStatusFilter: String, CaseIterable, Identifiable {
    case all = "ALL"
    case active = "ACTIVE"
    case banned = "BANNED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .active: return "Active"
        case .banned: return "Banned"
        }
    }
}

/// The three roles `PUT /api/admin/users/[id]` will actually accept.
///
/// `JOURNALIST` is deliberately excluded - that role is only ever granted
/// through `/api/admin/journalists/[id]` in the same transaction that
/// creates its `JournalistProfile`, and this endpoint has no such
/// transaction. A user already carrying `JOURNALIST` is shown as a
/// read-only badge instead of this picker (see `AdminUserDetailSheet`),
/// exactly as the web admin page does.
enum AdminAssignableRole: String, CaseIterable, Identifiable {
    case user = "USER"
    case moderator = "MODERATOR"
    case admin = "ADMIN"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .user: return "User"
        case .moderator: return "Moderator"
        case .admin: return "Admin"
        }
    }
}

/// The badge values `PUT /api/admin/users/[id]` accepts
/// (`VALID_BADGE_TYPES`), plus `nil` for "no badge".
enum AdminBadgeType: String, CaseIterable, Identifiable {
    case verified
    case organization
    case government
    case team
    case journalist

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .verified: return "Verified"
        case .organization: return "Organization"
        case .government: return "Government"
        case .team: return "ZRP Team"
        case .journalist: return "Journalist"
        }
    }
}

// MARK: - Reports (`/api/admin/reports`)

/// The `Post` half of a polymorphic report's target, trimmed to what this
/// screen shows. The route's `include` sends every scalar `Post` column -
/// `Decodable` synthesis silently ignores the ones not listed here rather
/// than failing, which is the point: new `Post` columns must never break
/// this screen.
struct AdminReportedPost: Decodable, Equatable {
    let id: String
    let content: String
    let imageUrl: String?
    let type: String
    let author: AdminActorRef
    let createdAt: Date
}

struct AdminReportedComment: Decodable, Equatable {
    let id: String
    let content: String
    let imageUrl: String?
    let author: AdminActorRef
    let createdAt: Date
}

struct AdminReportedListing: Decodable, Equatable {
    let id: String
    let title: String
    let category: String?
    let seller: AdminActorRef
}

struct AdminReportedChallenge: Decodable, Equatable {
    let id: String
    let title: String
    let creator: AdminActorRef?
}

struct AdminReportedOpportunity: Decodable, Equatable {
    let id: String
    let title: String
    let poster: AdminActorRef
}

struct AdminReportedCampaign: Decodable, Equatable {
    let id: String
    let title: String
    let organizer: AdminActorRef
}

/// Which of the report's seven polymorphic targets is actually set. At
/// most one of these is non-nil on any given `AdminReport` - see
/// `schema.prisma`'s own comments on `Report` for why there are seven.
enum AdminReportTarget: Equatable {
    case post(AdminReportedPost)
    case comment(AdminReportedComment)
    case listing(AdminReportedListing)
    case challenge(AdminReportedChallenge)
    case opportunity(AdminReportedOpportunity)
    case campaign(AdminReportedCampaign)
    /// A bare-profile report - harassment, impersonation, ban evasion -
    /// naming no single post/comment/listing.
    case user(AdminActorRef)
    /// Every target field was null. Only reachable if the reported
    /// content and the reporting user were both deleted (`onDelete:
    /// SetNull` on every one of these relations) after the report was
    /// filed.
    case none
}

struct AdminReport: Decodable, Identifiable, Equatable {
    let id: String
    let reporter: AdminActorRef
    let reason: String
    let details: String?
    let status: String
    let createdAt: Date
    let actionType: String?
    let actionNote: String?
    let actionedAt: Date?
    let post: AdminReportedPost?
    let comment: AdminReportedComment?
    let listing: AdminReportedListing?
    let challenge: AdminReportedChallenge?
    let opportunity: AdminReportedOpportunity?
    let campaign: AdminReportedCampaign?
    let reportedUser: AdminActorRef?

    var target: AdminReportTarget {
        if let post { return .post(post) }
        if let comment { return .comment(comment) }
        if let listing { return .listing(listing) }
        if let challenge { return .challenge(challenge) }
        if let opportunity { return .opportunity(opportunity) }
        if let campaign { return .campaign(campaign) }
        if let reportedUser { return .user(reportedUser) }
        return .none
    }
}

struct AdminReportsPage: Decodable {
    let reports: [AdminReport]
    let total: Int
    let page: Int
    let totalPages: Int
}

/// `status=` query value - lowercase, unlike the user/appeal role and
/// status filters above, because that is the literal string the
/// `Report.status` column stores.
enum AdminReportStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending
    case reviewed
    case dismissed
    case actioned

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pending: return "Pending"
        case .reviewed: return "Reviewed"
        case .dismissed: return "Dismissed"
        case .actioned: return "Actioned"
        }
    }
}

/// `actionType` on `PUT /api/admin/reports/[id]` - a **descriptive
/// label only**. Selecting "Ban user" here does not ban anyone; the web
/// admin page does not enforce it either, and this app matches that
/// exactly rather than inventing enforcement the backend does not have.
/// Carrying it out is a separate trip to Users (ban toggle) or Posts
/// (delete).
enum AdminReportActionType: String, CaseIterable, Identifiable {
    case deletePost = "DELETE_POST"
    case warnUser = "WARN_USER"
    case banUser = "BAN_USER"
    case muteUser = "MUTE_USER"
    case deleteComment = "DELETE_COMMENT"
    case other = "OTHER"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .deletePost: return "Delete post"
        case .warnUser: return "Warn user"
        case .banUser: return "Ban user"
        case .muteUser: return "Mute user"
        case .deleteComment: return "Delete comment"
        case .other: return "Other"
        }
    }
}

// MARK: - Appeals (`/api/admin/appeals`)

struct AdminAppealReportRef: Decodable, Equatable {
    let id: String
    let reason: String
    let actionType: String?
    let actionNote: String?
    let actionedAt: Date?
}

struct AdminAppeal: Decodable, Identifiable, Equatable {
    let id: String
    let user: AdminActorRef
    let report: AdminAppealReportRef
    let message: String
    let status: String
    let resolutionNote: String?
    let resolvedByUsername: String?
    let resolvedAt: Date?
    let createdAt: Date
}

struct AdminAppealsPage: Decodable {
    let appeals: [AdminAppeal]
    let total: Int
    let page: Int
    let totalPages: Int
}

enum AdminAppealStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending
    case upheld
    case overturned

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pending: return "Pending"
        case .upheld: return "Upheld"
        case .overturned: return "Overturned"
        }
    }
}

/// The only two outcomes `PUT /api/admin/appeals/[id]` accepts.
enum AdminAppealDecision: String, CaseIterable, Identifiable {
    case upheld
    case overturned

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .upheld: return "Uphold"
        case .overturned: return "Overturn"
        }
    }
}

// MARK: - Posts (`/api/admin/posts`)

struct AdminPostCounts: Decodable, Equatable {
    let likes: Int
    let comments: Int
    let reposts: Int
}

struct AdminPost: Decodable, Identifiable, Equatable {
    let id: String
    let content: String
    let imageUrl: String?
    let imageUrls: [String]
    let type: String
    let status: String
    let createdAt: Date
    let author: AdminActorRef
    let counts: AdminPostCounts

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, imageUrls, type, status, createdAt, author
        case counts = "_count"
    }

    /// The custom `Decodable` initializer below (for `imageUrls`'
    /// missing-key default) suppresses Swift's synthesized memberwise
    /// initializer, so this restates it - used by test fixtures and any
    /// other call site that builds an `AdminPost` directly rather than
    /// decoding one.
    init(
        id: String,
        content: String,
        imageUrl: String?,
        imageUrls: [String],
        type: String,
        status: String,
        createdAt: Date,
        author: AdminActorRef,
        counts: AdminPostCounts
    ) {
        self.id = id
        self.content = content
        self.imageUrl = imageUrl
        self.imageUrls = imageUrls
        self.type = type
        self.status = status
        self.createdAt = createdAt
        self.author = author
        self.counts = counts
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        content = try container.decode(String.self, forKey: .content)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        imageUrls = try container.decodeIfPresent([String].self, forKey: .imageUrls) ?? []
        type = try container.decode(String.self, forKey: .type)
        status = try container.decode(String.self, forKey: .status)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        author = try container.decode(AdminActorRef.self, forKey: .author)
        counts = try container.decode(AdminPostCounts.self, forKey: .counts)
    }
}

struct AdminPostsPage: Decodable {
    let posts: [AdminPost]
    let total: Int
    let page: Int
    let totalPages: Int
}
