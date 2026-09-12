import Foundation

/// Where a journalist application stands.
///
/// Unlike the ambassador flow, applying grants the JOURNALIST **role**
/// immediately - but not verification and not a badge. The gap matters:
/// an unverified journalist may write and save drafts, and may not
/// submit anything for review. Nothing in this app decides that; the
/// routes do, with a 403.
enum JournalistStatus: String, Decodable, Equatable {
    case pending = "PENDING"
    case verified = "VERIFIED"
    case rejected = "REJECTED"
    case suspended = "SUSPENDED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = JournalistStatus(rawValue: raw.uppercased()) ?? .unknown
    }
}

/// An article's place in the editorial workflow.
///
/// Three of these are load-bearing for what the app may offer:
/// - **DRAFT** - editable, submittable, deletable.
/// - **REJECTED** - editable and resubmittable, but *not* deletable.
/// - everything else - read-only here. Once something has been
///   submitted it stays for the editorial record; only an admin can
///   remove it.
enum ArticleStatus: String, Decodable, Equatable {
    case draft = "DRAFT"
    case pendingReview = "PENDING_REVIEW"
    case published = "PUBLISHED"
    case rejected = "REJECTED"
    case archived = "ARCHIVED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ArticleStatus(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .draft: return .journalistDashStatusDraft
        case .pendingReview: return .journalistEditorStatusPendingReview
        case .published: return .journalistEditorStatusPublished
        case .rejected: return .journalistDashStatRejected
        case .archived: return .journalistDashStatusArchived
        case .unknown: return nil
        }
    }

    /// `PATCH` refuses anything that is not a draft or a rejected
    /// article with a 409, so the editor is read-only for the rest
    /// rather than letting the refusal be how someone finds out.
    var isEditable: Bool {
        self == .draft || self == .rejected
    }

    /// `DELETE` accepts drafts and nothing else - a rejected article has
    /// been submitted once and stays for the record.
    var isDeletable: Bool {
        self == .draft
    }
}

/// The signed-in user's journalist application.
struct JournalistProfile: Decodable, Equatable {
    let id: String
    let status: JournalistStatus
    let outlet: String?
    let pitch: String?
    let portfolioUrl: String?
    let appliedAt: Date?
    let rejectionReason: String?
    let suspensionReason: String?

    private enum CodingKeys: String, CodingKey {
        case id, status, outlet, pitch, portfolioUrl, appliedAt
        case rejectionReason, suspensionReason
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decode(JournalistStatus.self, forKey: .status)
        outlet = try c.decodeIfPresent(String.self, forKey: .outlet)
        pitch = try c.decodeIfPresent(String.self, forKey: .pitch)
        portfolioUrl = try c.decodeIfPresent(String.self, forKey: .portfolioUrl)
        appliedAt = try c.decodeIfPresent(Date.self, forKey: .appliedAt)
        rejectionReason = try c.decodeIfPresent(String.self, forKey: .rejectionReason)
        suspensionReason = try c.decodeIfPresent(String.self, forKey: .suspensionReason)
    }
}

/// One of the author's own articles, as the journalist routes return it.
///
/// Deliberately not `NewsArticle`: the public news model carries a
/// resolved author and published content, while this one carries the
/// editorial fields that only the author sees - `status`, `reviewNote`,
/// `submittedAt`. Reusing the public type would make a reviewer's note
/// look like it had nowhere to live.
struct JournalistArticle: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let slug: String
    let status: ArticleStatus
    let category: NewsCategory
    let excerpt: String?
    let content: String?
    let coverImage: String?
    let sourceName: String?
    let sourceUrl: String?
    let views: Int

    /// The reviewer's note on a rejected article. The one piece of
    /// feedback a journalist gets, so it is never collapsed into a
    /// generic "rejected".
    let reviewNote: String?

    let submittedAt: Date?
    let publishedAt: Date?
    let updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, title, slug, status, category, excerpt, content, coverImage
        case sourceName, sourceUrl, views, reviewNote, submittedAt, publishedAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        slug = try c.decodeIfPresent(String.self, forKey: .slug) ?? ""
        status = try c.decode(ArticleStatus.self, forKey: .status)
        category = try c.decodeIfPresent(NewsCategory.self, forKey: .category) ?? .unknown
        excerpt = try c.decodeIfPresent(String.self, forKey: .excerpt)
        // Absent from the dashboard's `recentArticles` projection and
        // present from the article routes. Optional rather than
        // defaulted to "" so the editor can tell "not fetched" from
        // "empty", and never saves a blank body over a real one.
        content = try c.decodeIfPresent(String.self, forKey: .content)
        coverImage = try c.decodeIfPresent(String.self, forKey: .coverImage)
        sourceName = try c.decodeIfPresent(String.self, forKey: .sourceName)
        sourceUrl = try c.decodeIfPresent(String.self, forKey: .sourceUrl)
        views = try c.decodeIfPresent(Int.self, forKey: .views) ?? 0
        reviewNote = try c.decodeIfPresent(String.self, forKey: .reviewNote)
        submittedAt = try c.decodeIfPresent(Date.self, forKey: .submittedAt)
        publishedAt = try c.decodeIfPresent(Date.self, forKey: .publishedAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
    }
}

/// Article counts by status, from `GET /api/journalist/profile`.
struct JournalistCounts: Decodable, Equatable {
    let total: Int
    let draft: Int
    let pendingReview: Int
    let published: Int
    let rejected: Int
    let archived: Int
}

/// The whole dashboard payload.
///
/// `isJournalist` is computed server-side from the user's real role, not
/// from the profile's presence - the two can differ, and the role is
/// what the article routes actually check.
struct JournalistDashboard: Decodable, Equatable {
    let isJournalist: Bool
    let profile: JournalistProfile?
    let counts: JournalistCounts
    let recentArticles: [JournalistArticle]
}
