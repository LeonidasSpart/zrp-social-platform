import Foundation

/// A ZRP OPPORTUNITY listing, as `GET /api/opportunity` and
/// `GET /api/opportunity/{id}` return it.
struct Opportunity: Decodable, Identifiable, Equatable {
    let id: String
    let type: OpportunityType
    let title: String
    let description: String?
    let organizationName: String?
    let skills: [String]?
    let location: String?
    let remote: Bool?
    let isPaid: Bool?
    let compensationInfo: String?
    /// When set, applying happens on somebody else's site rather than
    /// through ZRP - see `OpportunityDetailView`.
    let externalUrl: String?
    let deadline: Date?
    let views: Int?
    let createdAt: Date
    let poster: PostAuthor?
    let counts: Counts?

    /// Only on the detail route, and only for a signed-in viewer: whether
    /// they have already applied. The route names it `alreadyApplied` and
    /// attaches it beside the listing.
    ///
    /// There is deliberately no saved flag here: no route reports whether
    /// a listing is saved. `POST`/`DELETE /api/opportunity/{id}/save`
    /// answer with the state they just set, and that is the only thing
    /// this app can honestly know - see `OpportunityDetailView`.
    let alreadyApplied: Bool?

    struct Counts: Decodable, Equatable, Hashable {
        let applications: Int
    }

    private enum CodingKeys: String, CodingKey {
        case id, type, title, description, organizationName, skills, location
        case remote, isPaid, compensationInfo, externalUrl, deadline, views
        case createdAt, poster, alreadyApplied
        case counts = "_count"
    }

    var applicationCount: Int { counts?.applications ?? 0 }
}

/// The eleven `OpportunityType` values in the schema.
enum OpportunityType: String, Decodable, CaseIterable, Identifiable, Hashable {
    case job = "JOB"
    case remote = "REMOTE"
    case internship = "INTERNSHIP"
    case scholarship = "SCHOLARSHIP"
    case mentorship = "MENTORSHIP"
    case freelance = "FREELANCE"
    case partnership = "PARTNERSHIP"
    case sponsorship = "SPONSORSHIP"
    case hackathon = "HACKATHON"
    case training = "TRAINING"
    case collaboration = "COLLABORATION"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OpportunityType(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .job: return .opportunityTypeJob
        case .remote: return .opportunityTypeRemote
        case .internship: return .opportunityTypeInternship
        case .scholarship: return .opportunityTypeScholarship
        case .mentorship: return .opportunityTypeMentorship
        case .freelance: return .opportunityTypeFreelance
        case .partnership: return .opportunityTypePartnership
        case .sponsorship: return .opportunityTypeSponsorship
        case .hackathon: return .opportunityTypeHackathon
        case .training: return .opportunityTypeTraining
        case .collaboration: return .opportunityTypeCollaboration
        case .unknown: return nil
        }
    }

    /// Never `unknown`, which the route would reject as a filter.
    static var selectable: [OpportunityType] {
        allCases.filter { $0 != .unknown }
    }

    /// The selectable types paired with their labels.
    ///
    /// Exists so a `Picker` can render them without an `if let` inside
    /// its `ForEach`: a conditional there wraps each row in
    /// `_ConditionalContent`, and SwiftUI's tag matching is not
    /// dependable through it - the selection silently stops binding.
    /// Every selectable type has a label by construction, since only
    /// `unknown` lacks one and it is filtered out.
    static var selectableWithTitles: [(type: OpportunityType, titleKey: L10nKey)] {
        selectable.compactMap { type in
            type.titleKey.map { (type, $0) }
        }
    }
}

/// One page of `GET /api/opportunity`.
struct OpportunitiesPage: Decodable, Equatable {
    let listings: [Opportunity]
    let nextCursor: String?
}

/// The moderation lifecycle of a listing, from the schema's
/// `OpportunityStatus`.
///
/// Only ever seen by a poster looking at their own listings: the public
/// browse route returns `ACTIVE` only, and the detail route 404s a
/// non-live listing to anyone but its poster and staff. So this exists
/// for "My listings" and nowhere else.
enum OpportunityStatus: String, Decodable, CaseIterable, Hashable {
    case pendingReview = "PENDING_REVIEW"
    case active = "ACTIVE"
    case rejected = "REJECTED"
    case expired = "EXPIRED"
    case closed = "CLOSED"
    case removed = "REMOVED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OpportunityStatus(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .pendingReview: return .opportunityStatusPendingReview
        case .active: return .opportunityStatusActive
        case .rejected: return .opportunityStatusRejected
        case .expired: return .opportunityStatusExpired
        case .closed: return .opportunityStatusClosed
        case .removed: return .opportunityStatusRemoved
        case .unknown: return nil
        }
    }
}

/// Where an application stands, from the schema's `ApplicationStatus`.
enum OpportunityApplicationStatus: String, Decodable, CaseIterable {
    case pending = "PENDING"
    case reviewed = "REVIEWED"
    case accepted = "ACCEPTED"
    case rejected = "REJECTED"
    case withdrawn = "WITHDRAWN"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OpportunityApplicationStatus(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .pending: return .opportunityAppStatusPending
        case .reviewed: return .opportunityAppStatusReviewed
        case .accepted: return .opportunityAppStatusAccepted
        case .rejected: return .opportunityAppStatusRejected
        case .withdrawn: return .opportunityAppStatusWithdrawn
        case .unknown: return nil
        }
    }
}

/// One of the viewer's own listings, from
/// `GET /api/opportunity/my-listings`.
///
/// The same row as `Opportunity` but carrying `status`,
/// `rejectionReason` and an applicant count - the fields the public
/// browse route never returns, because they are the poster's business
/// and nobody else's.
struct MyOpportunityListing: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let type: OpportunityType
    let title: String
    let description: String?
    let organizationName: String?
    let skills: [String]?
    let location: String?
    let remote: Bool?
    let isPaid: Bool?
    let compensationInfo: String?
    let externalUrl: String?
    let deadline: Date?
    let status: OpportunityStatus
    /// Set by a moderator when a listing is rejected. Shown verbatim -
    /// it is the only explanation the poster gets, and paraphrasing a
    /// moderation decision would be both inaccurate and unkind.
    let rejectionReason: String?
    let views: Int?
    let createdAt: Date
    let counts: Opportunity.Counts?

    private enum CodingKeys: String, CodingKey {
        case id, type, title, description, organizationName, skills, location
        case remote, isPaid, compensationInfo, externalUrl, deadline
        case status, rejectionReason, views, createdAt
        case counts = "_count"
    }

    var applicationCount: Int { counts?.applications ?? 0 }

    /// Only an ACTIVE listing can be closed, and the route enforces it:
    /// it accepts `status: "CLOSED"` from the owner only when the
    /// listing is currently ACTIVE, and silently keeps the existing
    /// status otherwise. Offering the control anywhere else would be
    /// offering a no-op.
    var canClose: Bool { status == .active }
}

struct MyOpportunityListingsPage: Decodable, Equatable {
    let listings: [MyOpportunityListing]
    let nextCursor: String?
}

/// One application the viewer has sent, from
/// `GET /api/opportunity/my-applications`.
struct MyOpportunityApplication: Decodable, Identifiable, Equatable {
    let id: String
    let coverNote: String?
    let resumeUrl: String?
    let status: OpportunityApplicationStatus
    let createdAt: Date
    let listing: ApplicationListing

    /// The route selects only these five fields of the listing - not the
    /// whole row - so this is modelled as its own type rather than
    /// pretending an `Opportunity` came back half-empty.
    struct ApplicationListing: Decodable, Equatable {
        let id: String
        let type: OpportunityType
        let title: String
        let organizationName: String?
        let status: OpportunityStatus
    }

    /// The route lets an applicant set exactly one status, WITHDRAWN,
    /// and only their own application. Everything else is a 403 with a
    /// message saying so.
    var canWithdraw: Bool {
        status != .withdrawn && status != .rejected
    }
}

struct MyOpportunityApplicationsPage: Decodable, Equatable {
    let applications: [MyOpportunityApplication]
    let nextCursor: String?
}

/// An applicant to one of the viewer's own listings, from
/// `GET /api/opportunity/{id}/applications` - poster or staff only,
/// 403 otherwise.
struct OpportunityApplicant: Decodable, Identifiable, Equatable {
    let id: String
    let coverNote: String?
    let resumeUrl: String?
    let status: OpportunityApplicationStatus
    let createdAt: Date
    let applicant: PostAuthor?
}

struct OpportunityApplicantsPage: Decodable, Equatable {
    let applications: [OpportunityApplicant]
    let nextCursor: String?
}
