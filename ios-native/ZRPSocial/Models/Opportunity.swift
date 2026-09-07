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

    struct Counts: Decodable, Equatable {
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
enum OpportunityType: String, Decodable, CaseIterable, Identifiable {
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
}

/// One page of `GET /api/opportunity`.
struct OpportunitiesPage: Decodable, Equatable {
    let listings: [Opportunity]
    let nextCursor: String?
}
