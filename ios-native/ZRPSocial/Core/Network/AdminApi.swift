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

// MARK: - Shared: paginated result

/// A page of admin results, built by hand in `AdminRepository` rather
/// than decoded directly - the review-queue routes below each nest
/// their array under a different JSON key (`listings`, `campaigns`,
/// `artists`...), so each repository method decodes its own small
/// private `Raw` type and wraps it in this common shape. Sharing this
/// (rather than one `Raw` type per kind duplicating the same four
/// fields) is what lets `AdminReviewQueueViewModel` below be generic
/// over every review-queue kind.
struct AdminPageResult<Item> {
    let items: [Item]
    let total: Int
    let page: Int
    let totalPages: Int
}

// MARK: - Review queues (Ads, Marketplace, Opportunity, HELP campaigns)

/// What every "user-submitted content awaiting staff approval" queue
/// has in common - see `schema.prisma`'s own comment on `Listing`
/// ("mirrors AdCampaign's moderation shape") and on `HelpCampaign`
/// ("same ... shape as Listing"). `AdminReviewQueueView`/
/// `AdminReviewQueueViewModel` are generic over this, so Marketplace,
/// Opportunity and HELP campaigns - which really are the same screen
/// with different fields - share one implementation rather than three
/// near-identical copies. Ads has extra actions (suspend/resume/cancel)
/// and its own lifecycle gate, so it gets its own screen instead of
/// forcing a fourth shape through this protocol.
protocol AdminReviewableItem: Decodable, Identifiable, Equatable where ID == String {
    var status: String { get }
    var rejectionReason: String? { get }
    var createdAt: Date { get }
    /// The listing/campaign's own title.
    var reviewTitle: String { get }
    /// Who submitted it.
    var reviewOwner: AdminActorRef { get }
    /// One extra descriptive line shown under the title - price,
    /// compensation, fundraising goal, whatever that kind's equivalent is.
    var reviewDetailLine: String { get }
}

/// `status=` query value shared by Marketplace/Opportunity/HELP - all
/// three default to `PENDING_REVIEW` and accept `all`. The full set of
/// terminal/live statuses differs per kind, so this only lists the ones
/// every review queue actually filters by in practice; a status this
/// screen doesn't offer is still reachable by whatever the route
/// defaults to.
enum AdminReviewStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pendingReview = "PENDING_REVIEW"
    case active = "ACTIVE"
    case rejected = "REJECTED"
    case removed = "REMOVED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pendingReview: return "Pending review"
        case .active: return "Active"
        case .rejected: return "Rejected"
        case .removed: return "Removed"
        }
    }
}

/// The three actions `PUT` on a Marketplace/Opportunity/HELP listing
/// accepts. `approve`/`reject` only from `PENDING_REVIEW`; `remove`
/// only from `ACTIVE` - enforced server-side, mirrored client-side so
/// the right buttons show for the right status (see each route's own
/// `if (action === "remove") ... else if (listing.status !== "PENDING_REVIEW")`).
enum AdminReviewAction: String, CaseIterable, Identifiable {
    case approve, reject, remove
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .approve: return "Approve"
        case .reject: return "Reject"
        case .remove: return "Remove"
        }
    }
}

extension AdminReviewableItem {
    /// Mirrors each route's own from-status gate - a UX guard, not the
    /// security boundary (the route re-checks this regardless).
    var availableReviewActions: [AdminReviewAction] {
        switch status {
        case "PENDING_REVIEW": return [.approve, .reject]
        case "ACTIVE": return [.remove]
        default: return []
        }
    }
}

struct AdminMarketplaceListing: AdminReviewableItem {
    let id: String
    let title: String
    let category: String
    let price: Double?
    let currency: String
    let priceOnRequest: Bool
    let location: String?
    let status: String
    let rejectionReason: String?
    let createdAt: Date
    let seller: AdminActorRef

    var reviewTitle: String { title }
    var reviewOwner: AdminActorRef { seller }
    var reviewDetailLine: String {
        let categoryLabel = category.replacingOccurrences(of: "_", with: " ").capitalized
        if priceOnRequest { return "\(categoryLabel) Â· Price on request" }
        if let price { return "\(categoryLabel) Â· \(currency) \(CountFormatting.exact(Int(price)))" }
        return categoryLabel
    }
}

struct AdminOpportunityListing: AdminReviewableItem {
    let id: String
    let title: String
    let type: String
    let organizationName: String?
    let location: String?
    let remote: Bool
    let isPaid: Bool
    let compensationInfo: String?
    let status: String
    let rejectionReason: String?
    let createdAt: Date
    let poster: AdminActorRef

    var reviewTitle: String { title }
    var reviewOwner: AdminActorRef { poster }
    var reviewDetailLine: String {
        var parts = [type.replacingOccurrences(of: "_", with: " ").capitalized]
        if let organizationName, !organizationName.isEmpty { parts.append(organizationName) }
        parts.append(remote ? "Remote" : (location ?? "On-site"))
        parts.append(isPaid ? (compensationInfo?.isEmpty == false ? compensationInfo! : "Paid") : "Unpaid")
        return parts.joined(separator: " Â· ")
    }
}

struct AdminHelpCampaignReview: AdminReviewableItem {
    let id: String
    let title: String
    let category: String
    let goalAmount: Double?
    let raisedAmount: Double
    let currency: String
    let status: String
    let rejectionReason: String?
    let createdAt: Date
    let organizer: AdminActorRef

    var reviewTitle: String { title }
    var reviewOwner: AdminActorRef { organizer }
    var reviewDetailLine: String {
        let categoryLabel = category.replacingOccurrences(of: "_", with: " ").capitalized
        guard let goalAmount, goalAmount > 0 else { return categoryLabel }
        return "\(categoryLabel) Â· \(currency) \(CountFormatting.exact(Int(raisedAmount))) of \(CountFormatting.exact(Int(goalAmount)))"
    }
}

// MARK: - Ads (`/api/admin/ads`)

struct AdminAdCampaignPost: Decodable, Equatable {
    let id: String
    let content: String
    let imageUrl: String?
    let imageUrls: [String]
    let mediaType: String?
}

struct AdminAdCampaign: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let status: String
    let bidType: String
    let bidAmount: Double
    let budgetTotal: Double
    let budgetSpent: Double
    let targetUrl: String?
    let startDate: Date?
    let endDate: Date?
    let rejectionReason: String?
    let adminNote: String?
    let createdAt: Date
    let advertiser: AdminActorRef
    let post: AdminAdCampaignPost
}

/// `status=` query value - the full `AdCampaignStatus` enum, unlike the
/// curated set the other review queues offer, since an ad campaign's
/// lifecycle genuinely has this many staff-relevant states.
enum AdminAdStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pendingReview = "PENDING_REVIEW"
    case paymentPending = "PAYMENT_PENDING"
    case paymentFailed = "PAYMENT_FAILED"
    case active = "ACTIVE"
    case paused = "PAUSED"
    case suspended = "SUSPENDED"
    case completed = "COMPLETED"
    case rejected = "REJECTED"
    case cancelled = "CANCELLED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pendingReview: return "Pending review"
        case .paymentPending: return "Payment pending"
        case .paymentFailed: return "Payment failed"
        case .active: return "Active"
        case .paused: return "Paused"
        case .suspended: return "Suspended"
        case .completed: return "Completed"
        case .rejected: return "Rejected"
        case .cancelled: return "Cancelled"
        }
    }
}

enum AdminAdAction: String, CaseIterable, Identifiable {
    case approve, reject, suspend, resume, cancel, note
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .approve: return "Approve"
        case .reject: return "Reject"
        case .suspend: return "Suspend"
        case .resume: return "Resume"
        case .cancel: return "Cancel"
        case .note: return "Save note"
        }
    }
}

extension AdminAdCampaign {
    /// Mirrors `src/lib/ads/lifecycle.ts`'s `staff` transition map - a UX
    /// guard, not the security boundary (`canTransition` re-checks this
    /// server-side on every `PUT`). `.note` is always available since it
    /// never changes status.
    var availableActions: [AdminAdAction] {
        let lifecycle: [AdminAdAction]
        switch status {
        case "PENDING_REVIEW": lifecycle = [.approve, .reject]
        case "PAYMENT_PENDING", "PAYMENT_FAILED": lifecycle = [.cancel]
        case "ACTIVE", "PAUSED": lifecycle = [.suspend, .cancel]
        case "SUSPENDED": lifecycle = [.resume, .cancel]
        default: lifecycle = []
        }
        return lifecycle + [.note]
    }
}

struct AdminAdsPage: Decodable {
    let campaigns: [AdminAdCampaign]
    let total: Int
    let page: Int
    let totalPages: Int
}

// MARK: - Withdrawals (Creator + HELP campaign)

/// What a creator payout and a HELP campaign payout have in common -
/// see `AdminReviewableItem`'s own doc comment for why this is a
/// protocol rather than three near-identical screens.
protocol AdminWithdrawalRequest: Decodable, Identifiable, Equatable where ID == String {
    var amount: Double { get }
    var currency: String { get }
    var walletAddress: String { get }
    var status: String { get }
    var transactionHash: String? { get }
    var createdAt: Date { get }
    var withdrawalOwner: AdminActorRef { get }
    /// One extra line under the amount - nothing for a creator payout,
    /// the campaign name for a HELP one.
    var withdrawalDetailLine: String? { get }
}

enum AdminWithdrawalStatusFilter: String, CaseIterable, Identifiable {
    case pending = "PENDING"
    case processing = "PROCESSING"
    case completed = "COMPLETED"
    case failed = "FAILED"
    case rejected = "REJECTED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .processing: return "Processing"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .rejected: return "Rejected"
        }
    }
}

struct AdminCreatorWithdrawal: AdminWithdrawalRequest {
    let id: String
    let amount: Double
    let currency: String
    let walletAddress: String
    let status: String
    let transactionHash: String?
    let createdAt: Date
    let user: AdminActorRef

    var withdrawalOwner: AdminActorRef { user }
    var withdrawalDetailLine: String? { nil }
}

struct AdminHelpCampaignRef: Decodable, Equatable {
    let id: String
    let title: String
}

struct AdminHelpWithdrawal: AdminWithdrawalRequest {
    let id: String
    let amount: Double
    let currency: String
    let walletAddress: String
    let status: String
    let transactionHash: String?
    let createdAt: Date
    let organizer: AdminActorRef
    let campaign: AdminHelpCampaignRef

    var withdrawalOwner: AdminActorRef { organizer }
    var withdrawalDetailLine: String? { "For: \(campaign.title)" }
}

// MARK: - Journalists (`/api/admin/journalists`)

/// A journalist application/profile. `id` is the **user's** id - the
/// route keys every action off `JournalistProfile.userId`, not the
/// profile row's own id, because the badge/role sync (`syncJournalistBadge`,
/// `User.role`) both key off the user too.
struct AdminJournalistProfile: Decodable, Identifiable, Equatable {
    let userId: String
    let status: String
    let outlet: String?
    let pitch: String?
    let portfolioUrl: String?
    let appliedAt: Date
    let reviewedAt: Date?
    let rejectionReason: String?
    let suspensionReason: String?
    let user: AdminActorRef

    var id: String { userId }
}

struct AdminJournalistsPage: Decodable {
    let profiles: [AdminJournalistProfile]
    let counts: [String: Int]
    struct Pagination: Decodable {
        let page: Int
        let totalPages: Int
        let total: Int
    }
    let pagination: Pagination
}

enum AdminJournalistStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending = "PENDING"
    case verified = "VERIFIED"
    case rejected = "REJECTED"
    case suspended = "SUSPENDED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pending: return "Pending"
        case .verified: return "Verified"
        case .rejected: return "Rejected"
        case .suspended: return "Suspended"
        }
    }
}

enum AdminJournalistAction: String, CaseIterable, Identifiable {
    case approve, reject, suspend, restore, remove
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .approve: return "Approve"
        case .reject: return "Reject"
        case .suspend: return "Suspend"
        case .restore: return "Restore"
        case .remove: return "Remove journalist status"
        }
    }
}

extension AdminJournalistProfile {
    /// Mirrors `PATCH /api/admin/journalists/[id]`'s own `REQUIRED_STATUS`-
    /// style gate - a UX guard, not the security boundary.
    var availableActions: [AdminJournalistAction] {
        switch status {
        case "PENDING": return [.approve, .reject]
        case "VERIFIED": return [.suspend, .remove]
        case "SUSPENDED": return [.restore, .remove]
        default: return []
        }
    }
}

// MARK: - Music artist verification (`/api/admin/music/artists`)

struct AdminMusicArtistCounts: Decodable, Equatable {
    let tracks: Int
    let followers: Int
}

struct AdminMusicArtist: Decodable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let verified: Bool
    let createdAt: Date
    let user: AdminActorRef
    let counts: AdminMusicArtistCounts

    private enum CodingKeys: String, CodingKey {
        case id, displayName, bio, avatarUrl, verified, createdAt, user
        case counts = "_count"
    }
}

struct AdminMusicArtistsPage: Decodable {
    let artists: [AdminMusicArtist]
    let total: Int
    let page: Int
    let totalPages: Int
}

enum AdminMusicArtistStatusFilter: String, CaseIterable, Identifiable {
    case all
    case verified
    case unverified

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .verified: return "Verified"
        case .unverified: return "Unverified"
        }
    }
}

// MARK: - Ambassadors (`/api/admin/ambassadors`)

/// Same shape as `AdminJournalistProfile` - `id` is the user's id.
struct AdminAmbassadorProfile: Decodable, Identifiable, Equatable {
    let userId: String
    let status: String
    let level: String
    let countryCode: String
    let countryName: String
    let cityRegion: String?
    let languages: [String]
    let motivation: String
    let communityDescription: String?
    let audienceSize: Int?
    let appliedAt: Date
    let reviewedAt: Date?
    let rejectionReason: String?
    let suspensionReason: String?
    let user: AdminActorRef

    var id: String { userId }
}

struct AdminAmbassadorsPage: Decodable {
    let profiles: [AdminAmbassadorProfile]
    let counts: [String: Int]
    struct Pagination: Decodable {
        let page: Int
        let totalPages: Int
        let total: Int
    }
    let pagination: Pagination
}

enum AdminAmbassadorStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending = "PENDING"
    case approved = "APPROVED"
    case rejected = "REJECTED"
    case suspended = "SUSPENDED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .pending: return "Pending"
        case .approved: return "Approved"
        case .rejected: return "Rejected"
        case .suspended: return "Suspended"
        }
    }
}

enum AdminAmbassadorAction: String, CaseIterable, Identifiable {
    case approve, reject, suspend, restore
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .approve: return "Approve"
        case .reject: return "Reject"
        case .suspend: return "Suspend"
        case .restore: return "Restore"
        }
    }
}

extension AdminAmbassadorProfile {
    var availableActions: [AdminAmbassadorAction] {
        switch status {
        case "PENDING": return [.approve, .reject]
        case "APPROVED": return [.suspend]
        case "SUSPENDED": return [.restore]
        default: return []
        }
    }
}

// MARK: - Support tickets (`/api/admin/support/tickets`) - ADMIN only

struct AdminSupportTicketReplyPreview: Decodable, Equatable {
    let id: String
    let message: String
    let isInternal: Bool
    let createdAt: Date
    let user: AdminActorRef
}

struct AdminSupportTicketUser: Decodable, Equatable {
    let id: String
    let username: String
    let email: String?
    let avatarUrl: String?
    let plan: String?
}

struct AdminSupportTicket: Decodable, Identifiable, Equatable {
    let id: String
    let subject: String
    let message: String
    let category: String
    let priority: String
    let status: String
    let createdAt: Date
    let resolution: String?
    let resolvedAt: Date?
    let user: AdminSupportTicketUser
    let assignedAdmin: AdminActorRef?
    let replies: [AdminSupportTicketReplyPreview]
    let counts: AdminTicketReplyCounts

    private enum CodingKeys: String, CodingKey {
        case id, subject, message, category, priority, status, createdAt, resolution, resolvedAt
        case user, assignedAdmin, replies
        case counts = "_count"
    }
}

struct AdminTicketReplyCounts: Decodable, Equatable {
    let replies: Int
}

struct AdminSupportTicketsPage: Decodable {
    let tickets: [AdminSupportTicket]
    struct Pagination: Decodable { let page: Int; let pages: Int; let total: Int }
    let pagination: Pagination
}

struct AdminSupportTicketStats: Decodable, Equatable {
    let open: Int
    let inProgress: Int
    let awaitingReply: Int
    let resolved: Int
    let total: Int
}

/// The full ticket thread, from `GET /api/admin/support/tickets/{id}`.
struct AdminSupportTicketDetail: Decodable, Equatable {
    struct DetailUser: Decodable, Equatable {
        let id: String
        let username: String
        let email: String?
        let avatarUrl: String?
        let plan: String?
        let createdAt: Date
    }
    struct Reply: Decodable, Identifiable, Equatable {
        let id: String
        let message: String
        let isInternal: Bool
        let createdAt: Date
        let user: AdminActorRef
    }

    let id: String
    let subject: String
    let message: String
    let category: String
    let priority: String
    let status: String
    let createdAt: Date
    let resolution: String?
    let resolvedAt: Date?
    let user: DetailUser
    let assignedAdmin: AdminActorRef?
    let replies: [Reply]
}

enum AdminTicketStatusFilter: String, CaseIterable, Identifiable {
    case all
    case open = "OPEN"
    case inProgress = "IN_PROGRESS"
    case awaitingReply = "AWAITING_REPLY"
    case resolved = "RESOLVED"
    case closed = "CLOSED"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .all: return "All"
        case .open: return "Open"
        case .inProgress: return "In progress"
        case .awaitingReply: return "Awaiting reply"
        case .resolved: return "Resolved"
        case .closed: return "Closed"
        }
    }
}

// MARK: - Analytics (`/api/admin/analytics`) - ADMIN only

struct AdminAnalyticsSummary: Decodable, Equatable {
    let users: Int
    let posts: Int
    let comments: Int
    let likes: Int
    let reposts: Int
}

struct AdminAnalyticsDailyPoint: Decodable, Identifiable, Equatable {
    let date: String
    let users: Int
    let posts: Int
    let comments: Int
    let likes: Int
    let reposts: Int

    var id: String { date }
}

struct AdminAnalyticsTopPost: Decodable, Identifiable, Equatable {
    struct Author: Decodable, Equatable {
        let username: String
        let name: String?
    }
    struct Counts: Decodable, Equatable {
        let likes: Int
        let comments: Int
        let reposts: Int
    }
    let id: String
    let content: String
    let createdAt: Date
    let author: Author
    let engagement: Int
    let counts: Counts

    private enum CodingKeys: String, CodingKey {
        case id, content, createdAt, author, engagement
        case counts = "_count"
    }
}

struct AdminAnalyticsEngagement: Decodable, Equatable {
    let avgLikesPerPost: Double
    let avgCommentsPerPost: Double
    let totalLikes: Int
    let totalComments: Int
    let totalPosts: Int
}

struct AdminAnalytics: Decodable, Equatable {
    let range: String
    let summary: AdminAnalyticsSummary
    let daily: [AdminAnalyticsDailyPoint]
    let topPosts: [AdminAnalyticsTopPost]
    let engagement: AdminAnalyticsEngagement
}

enum AdminAnalyticsRange: String, CaseIterable, Identifiable {
    case sevenDays = "7d"
    case thirtyDays = "30d"
    case ninetyDays = "90d"
    case all = "all"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .sevenDays: return "7 days"
        case .thirtyDays: return "30 days"
        case .ninetyDays: return "90 days"
        case .all: return "All time"
        }
    }
}

// MARK: - Audit log (`/api/admin/audit-log`) - ADMIN only, no web UI

struct AdminAuditLogEntry: Decodable, Identifiable, Equatable {
    let id: String
    let actorId: String?
    let actorUsername: String?
    let action: String
    let targetType: String?
    let targetId: String?
    let createdAt: Date
    /// Arbitrary per-action JSON, decoded loosely and rendered as
    /// `key: value` lines rather than typed per action - there are
    /// dozens of distinct `action` strings across this whole console
    /// (`user.ban`, `withdrawal.approve`, `report.delete`...) and this is
    /// the one screen whose entire job is showing whatever was actually
    /// recorded, not reshaping it.
    let metadata: [String: AdminJSONValue]?
}

struct AdminAuditLogPage: Decodable {
    let entries: [AdminAuditLogEntry]
    let nextCursor: String?
}

/// A minimal `Decodable` sum type for the audit log's free-form
/// `metadata` JSON - a string, number, bool, null, or nested
/// array/object of the same. Just enough to render `key: value` without
/// assuming a shape.
enum AdminJSONValue: Decodable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([AdminJSONValue])
    case object([String: AdminJSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([AdminJSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: AdminJSONValue].self) {
            self = .object(object)
        } else {
            self = .null
        }
    }

    /// A short, human-readable rendering for the audit log's detail view.
    var displayString: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
        case .bool(let value): return value ? "true" : "false"
        case .null: return "\u{2013}"
        case .array(let values): return "[" + values.map(\.displayString).joined(separator: ", ") + "]"
        case .object(let dict): return dict.map { "\($0.key): \($0.value.displayString)" }.sorted().joined(separator: ", ")
        }
    }
}

// MARK: - Charity disbursements (`/api/admin/charity-disbursements`) - ADMIN only, no web UI

struct AdminCharityDisbursement: Decodable, Identifiable, Equatable {
    let id: String
    let beneficiaryName: String
    let cause: String
    let amount: Double
    let currency: String
    let disbursedAt: Date
    let note: String?
    let proofUrl: String?
    let recordedByUsername: String?
}

/// The four causes `POST /api/admin/charity-disbursements` accepts.
enum AdminCharityCause: String, CaseIterable, Identifiable {
    case orphanages, schools, hospitals, climate
    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
}

// MARK: - Subscriptions & Billing (`/api/admin/subscriptions`) - ADMIN only

struct AdminSubscriptionUserRef: Decodable, Equatable {
    let id: String
    let username: String
    let email: String?
    let name: String?
    let plan: String
    let badgeType: String?
    let avatarUrl: String?
}

struct AdminSubscriptionPaymentRecord: Decodable, Identifiable, Equatable {
    let id: String
    let amount: Double
    let plan: String
    let billingInterval: String?
    let paymentMethod: String
    let createdAt: Date
}

struct AdminSubscriptionRow: Decodable, Identifiable, Equatable {
    let userId: String
    let user: AdminSubscriptionUserRef
    let plan: String
    let status: String
    let billingInterval: String?
    let currentPeriodEnd: Date?
    let daysRemaining: Int?
    let needsReconciliation: Bool
    let lastPayment: AdminSubscriptionPaymentRecord?

    var id: String { userId }
}

struct AdminSubscriptionsOverview: Decodable, Equatable {
    let active: Int
    let expired: Int
    let canceled: Int
    let pending: Int
    let expiringWithin7Days: Int
    let expiringWithin30Days: Int
    let failedPayments: Int
    let paidUsers: Int
    let freeUsers: Int
    let needsReconciliation: Int
}

struct AdminSubscriptionsPage: Decodable {
    let overview: AdminSubscriptionsOverview
    let subscriptions: [AdminSubscriptionRow]
    struct Pagination: Decodable { let page: Int; let totalPages: Int; let total: Int }
    let pagination: Pagination
}

/// `GET /api/admin/subscriptions/{userId}` - one user's full billing
/// detail. Legacy `legacyPaymentRequests`/`legacyUpgradeRequests` and the
/// subscription's `events` history are read by the web page for full
/// audit context; this screen shows the current subscription and its
/// payment history, which covers what a phone-side "grant/cancel/restore"
/// decision actually needs - see PARITY.md for the exact narrower scope.
struct AdminSubscriptionDetail: Decodable, Equatable {
    struct DetailUser: Decodable, Equatable {
        let id: String
        let username: String
        let email: String?
        let name: String?
        let plan: String
        let badgeType: String?
        let createdAt: Date
    }
    struct Subscription: Decodable, Equatable {
        let id: String
        let plan: String
        let status: String
        let billingInterval: String?
        let currentPeriodStart: Date?
        let currentPeriodEnd: Date?
        let daysRemaining: Int?
        let canceledAt: Date?
        let expiredAt: Date?
        let isLegacyBackfill: Bool
        let payments: [AdminSubscriptionPaymentRecord]
    }

    let user: DetailUser
    let subscription: Subscription?
}

/// The three plans `POST /api/admin/subscriptions/{userId}/grant`
/// accepts - never `free` (nothing to grant), and never `enterprise`'s
/// sibling values that don't exist; matches `VALID_PLANS.filter(plan =>
/// plan !== "free")` server-side.
enum AdminGrantablePlan: String, CaseIterable, Identifiable {
    case pro, business, enterprise
    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
}

enum AdminBillingInterval: String, CaseIterable, Identifiable {
    case monthly, yearly
    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
}

// MARK: - Storage cleanup (`/api/admin/cleanup-uploadthing`) - ADMIN only

struct AdminStorageScanResult: Decodable, Equatable {
    let totalFilesInUploadThing: Int
    let totalReferencedInDb: Int
    let nonUploadedStatusCount: Int
    let orphanedCount: Int
    let orphanedSizeMB: Double
    let heldForReviewCount: Int
    let heldForReviewSizeMB: Double
}

struct AdminStorageCleanupResult: Decodable, Equatable {
    let orphanedCount: Int
    let orphanedSizeMB: Double
    let heldForReviewCount: Int
    let deleted: Int
}

// MARK: - News CMS (`/api/admin/news`) - staff

struct AdminNewsArticle: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let slug: String
    let excerpt: String?
    let content: String
    let coverImage: String?
    let sourceName: String?
    let sourceUrl: String?
    let category: String
    let status: String
    let views: Int
    let featured: Bool
    let publishedAt: Date?
    let submittedAt: Date?
    let reviewNote: String?
    let reviewedAt: Date?
    let createdAt: Date
    let author: AdminActorRef
}

struct AdminNewsArticlesPage: Decodable {
    let articles: [AdminNewsArticle]
    struct Pagination: Decodable { let page: Int; let totalPages: Int; let total: Int }
    let pagination: Pagination
}

struct AdminNewsArticleResponse: Decodable {
    let article: AdminNewsArticle
}

enum AdminNewsCategory: String, CaseIterable, Identifiable {
    case world = "WORLD"
    case europe = "EUROPE"
    case switzerland = "SWITZERLAND"
    case politics = "POLITICS"
    case business = "BUSINESS"
    case technology = "TECHNOLOGY"
    case crypto = "CRYPTO"
    case science = "SCIENCE"
    case sports = "SPORTS"
    case culture = "CULTURE"
    case community = "COMMUNITY"
    case gaming = "GAMING"

    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
}

enum AdminNewsStatus: String, CaseIterable, Identifiable {
    case draft = "DRAFT"
    case pendingReview = "PENDING_REVIEW"
    case published = "PUBLISHED"
    case rejected = "REJECTED"
    case archived = "ARCHIVED"

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .draft: return "Draft"
        case .pendingReview: return "Pending review"
        case .published: return "Published"
        case .rejected: return "Rejected"
        case .archived: return "Archived"
        }
    }
}

enum AdminNewsStatusFilter: String, CaseIterable, Identifiable {
    case all
    case draft = "DRAFT"
    case pendingReview = "PENDING_REVIEW"
    case published = "PUBLISHED"
    case rejected = "REJECTED"
    case archived = "ARCHIVED"

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .all: return "All"
        case .draft: return "Draft"
        case .pendingReview: return "Pending review"
        case .published: return "Published"
        case .rejected: return "Rejected"
        case .archived: return "Archived"
        }
    }
}

/// Everything a create or edit form needs. Used for both `POST` (create)
/// and `PUT`/`PATCH` (edit) - the edit form always holds the article's
/// full current state, so sending every field on save is equivalent to
/// the route's own "only the keys present change" contract without this
/// app needing to track which individual fields were actually touched.
struct AdminNewsArticleDraft {
    var title = ""
    var slug = ""
    var excerpt = ""
    var content = ""
    var coverImage = ""
    var sourceName = ""
    var sourceUrl = ""
    var category: AdminNewsCategory = .world
    var status: AdminNewsStatus = .draft
    var authorId = ""
    var featured = false
    var reviewNote = ""
}

// MARK: - News Network automation (`/api/admin/news-network`) - overview only, see AdminNewsNetworkView

struct AdminNewsNetworkSettings: Decodable, Equatable {
    let paused: Bool
    let lastCycleAt: Date?
    let nextCycleAt: Date?
    let requireHumanReviewForSensitive: Bool
    let enabledLanguages: [String]
    let maxPublicationsPerCycle: Int
    let maxPublicationsPerDay: Int
    let minMinutesBetweenPublications: Int
}

struct AdminNewsNetworkJobRun: Decodable, Equatable {
    let id: String
    let startedAt: Date
    let finishedAt: Date?
    let published: Int?
    let duplicatesPrevented: Int?
}

struct AdminNewsNetworkStatus: Decodable, Equatable {
    struct Feeds: Decodable, Equatable { let total: Int; let enabled: Int }
    struct Publications: Decodable, Equatable { let today: Int; let scheduled: Int; let failed: Int }
    struct Stories: Decodable, Equatable { let ready: Int; let pendingSensitiveReview: Int }
    struct SourceHealth: Decodable, Equatable {
        let healthy: Int
        let warning: Int
        let failed: Int
        let disabled: Int

        private enum CodingKeys: String, CodingKey {
            case healthy = "HEALTHY", warning = "WARNING", failed = "FAILED", disabled = "DISABLED"
        }
    }

    let status: AdminNewsNetworkSettings
    let lastRun: AdminNewsNetworkJobRun?
    let feeds: Feeds
    let publications: Publications
    let stories: Stories
    let duplicatesPreventedToday: Int
    let sourceHealth: SourceHealth
}

struct AdminNewsNetworkRunResult: Decodable, Equatable {
    struct Result: Decodable, Equatable {
        let ran: Bool
        let reason: String?
        let published: Int?
        let scheduled: Int?
    }
    let result: Result
}
