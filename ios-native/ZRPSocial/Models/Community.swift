import Foundation

/// A real, database-backed community - see prisma/schema.prisma's
/// Community/CommunityMember models. Its feed is derived from
/// `hashtag` via the existing Post.hashtags array, the same source
/// `HashtagView` already reads from - not a separate post-tagging
/// system.
enum CommunityCategory: String, Codable, CaseIterable {
    case travel = "TRAVEL"
    case photography = "PHOTOGRAPHY"
    case nature = "NATURE"
    case technology = "TECHNOLOGY"
    case healthFitness = "HEALTH_FITNESS"
    case artDesign = "ART_DESIGN"
    case general = "GENERAL"

    var titleKey: L10nKey {
        switch self {
        case .travel: return .communitiesCategoryTravel
        case .photography: return .communitiesCategoryPhotography
        case .nature: return .communitiesCategoryNature
        case .technology: return .communitiesCategoryTechnology
        case .healthFitness: return .communitiesCategoryHealthFitness
        case .artDesign: return .communitiesCategoryArtDesign
        case .general: return .communitiesCategoryGeneral
        }
    }
}

struct Community: Decodable, Identifiable, Equatable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let category: CommunityCategory
    let hashtag: String
    let iconUrl: String?
    let memberCount: Int
    var isMember: Bool = false
    var myRole: String?
}

struct CommunitiesPage: Decodable {
    let items: [Community]
    let nextCursor: String?
}

struct CommunityDetailResponse: Decodable {
    let community: Community
    let isMember: Bool
    let myRole: String?
}

struct CreateCommunityRequest: Encodable {
    let name: String
    let description: String
    let category: String
    let hashtag: String
}

struct CreateCommunityResponse: Decodable {
    let community: Community
}

struct CommunityMembershipResponse: Decodable {
    let isMember: Bool
}
