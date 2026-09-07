import Foundation

/// A ZRP HELP campaign, as `GET /api/help` and `GET /api/help/{id}`
/// return it.
///
/// Money amounts arrive as strings because the columns are Prisma
/// `Decimal`s, which the route serialises rather than rounding through a
/// float. They are kept as strings here for the same reason: a currency
/// amount that has already been formatted correctly server-side should
/// not be re-parsed into a `Double` on the way to a label.
struct HelpCampaign: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let category: HelpCategory
    let needTypes: [HelpNeedType]
    let location: String?
    let goalAmount: String?
    let raisedAmount: String?
    let currency: String?
    let imageUrls: [String]?
    let createdAt: Date
    let organizer: PostAuthor?

    /// The needs this campaign is asking for that a native client can
    /// actually answer. Money is not one of them - see `AidCampaignView`.
    var offerableNeeds: [HelpNeedType] {
        needTypes.filter(\.isOfferable)
    }
}

/// The five categories `HELP_CATEGORIES` defines.
enum HelpCategory: String, Decodable, CaseIterable, Identifiable {
    case war = "WAR"
    case disaster = "DISASTER"
    case poverty = "POVERTY"
    case emergency = "EMERGENCY"
    case other = "OTHER"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HelpCategory(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .war: return .helpCategoryWar
        case .disaster: return .helpCategoryDisaster
        case .poverty: return .helpCategoryPoverty
        case .emergency: return .helpCategoryEmergency
        case .other: return .helpCategoryOther
        case .unknown: return nil
        }
    }

    var systemImage: String {
        switch self {
        case .war: return "shield.lefthalf.filled"
        case .disaster: return "cloud.bolt.rain"
        case .poverty: return "hand.raised"
        case .emergency: return "exclamationmark.triangle"
        case .other, .unknown: return "heart"
        }
    }

    /// Never `unknown`, which the route rejects as a filter.
    static var selectable: [HelpCategory] {
        allCases.filter { $0 != .unknown }
    }
}

/// The four kinds of help a campaign can ask for.
enum HelpNeedType: String, Decodable, CaseIterable, Identifiable {
    case money = "MONEY"
    case supplies = "SUPPLIES"
    case skills = "SKILLS"
    case volunteers = "VOLUNTEERS"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HelpNeedType(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .money: return .helpNeedMoney
        case .supplies: return .helpNeedSupplies
        case .skills: return .helpNeedSkills
        case .volunteers: return .helpNeedVolunteers
        case .unknown: return nil
        }
    }

    var systemImage: String {
        switch self {
        case .money: return "banknote"
        case .supplies: return "shippingbox"
        case .skills: return "wrench.and.screwdriver"
        case .volunteers: return "person.3"
        case .unknown: return "questionmark"
        }
    }

    /// What `POST /api/help/{id}/offer` accepts. Money is excluded by the
    /// route itself - a contribution is a payment, and payments go
    /// through `/contribute`, which native clients are refused.
    var isOfferable: Bool {
        self == .supplies || self == .skills || self == .volunteers
    }
}

/// One page of `GET /api/help`.
struct HelpCampaignsPage: Decodable, Equatable {
    let campaigns: [HelpCampaign]
    let nextCursor: String?
}
