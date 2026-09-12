import Foundation

/// Where an application stands. Only an admin moves it.
///
/// Nothing the client does grants ambassador status: `POST
/// /api/ambassadors/apply` only ever creates a `PENDING` row, and
/// approval happens exclusively through the admin route. The app must
/// never present someone as an ambassador before the server says so.
enum AmbassadorStatus: String, Decodable, Equatable {
    case pending = "PENDING"
    case approved = "APPROVED"
    case rejected = "REJECTED"
    case suspended = "SUSPENDED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AmbassadorStatus(rawValue: raw.uppercased()) ?? .unknown
    }
}

/// Progression, which is earned through real community activity and set
/// server-side - never by the client.
enum AmbassadorLevel: String, Decodable, Equatable {
    case explorer = "EXPLORER"
    case ambassador = "AMBASSADOR"
    case communityLeader = "COMMUNITY_LEADER"
    case globalAmbassador = "GLOBAL_AMBASSADOR"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AmbassadorLevel(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .explorer: return .ambassadorsLevelsExplorer
        case .ambassador: return .ambassadorsLevelsAmbassador
        case .communityLeader: return .ambassadorsLevelsCommunityLeader
        case .globalAmbassador: return .ambassadorsLevelsGlobalAmbassador
        case .unknown: return nil
        }
    }

    var descriptionKey: L10nKey? {
        switch self {
        case .explorer: return .ambassadorsLevelsExplorerDesc
        case .ambassador: return .ambassadorsLevelsAmbassadorDesc
        case .communityLeader: return .ambassadorsLevelsCommunityLeaderDesc
        case .globalAmbassador: return .ambassadorsLevelsGlobalAmbassadorDesc
        case .unknown: return nil
        }
    }

    /// The four, in the order the web page presents them.
    static let ladder: [AmbassadorLevel] = [
        .explorer, .ambassador, .communityLeader, .globalAmbassador,
    ]
}

/// `GET /api/ambassadors/me` -> `{profile}`.
///
/// `profile` is genuinely null for anyone who has never applied - the
/// route says so explicitly - so the dashboard can render an honest
/// "not an ambassador" state rather than a fabricated one.
struct AmbassadorProfile: Decodable, Equatable {
    let id: String
    let status: AmbassadorStatus
    let level: AmbassadorLevel
    let countryCode: String
    let cityRegion: String?
    let languages: [String]
    let communityLinks: [String]
    let motivation: String
    let communityDescription: String?
    let audienceSize: Int?

    /// Stable per-profile referral code. The dashboard turns it into
    /// `https://zrp.one/signup?ref=<code>`.
    let invitationCode: String

    let appliedAt: Date
    let rejectionReason: String?
    let suspensionReason: String?

    /// What the holder last accepted. Compared against the server's
    /// current version to decide whether to prompt again - the
    /// comparison is a display concern; the stamp itself is written
    /// server-side and never supplied by the client.
    let codeOfConductVersion: String?
    let codeOfConductAcceptedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, status, level, countryCode, cityRegion, languages, communityLinks
        case motivation, communityDescription, audienceSize, invitationCode, appliedAt
        case rejectionReason, suspensionReason, codeOfConductVersion, codeOfConductAcceptedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decode(AmbassadorStatus.self, forKey: .status)
        level = try c.decode(AmbassadorLevel.self, forKey: .level)
        countryCode = try c.decode(String.self, forKey: .countryCode)
        cityRegion = try c.decodeIfPresent(String.self, forKey: .cityRegion)
        languages = try c.decodeIfPresent([String].self, forKey: .languages) ?? []
        communityLinks = try c.decodeIfPresent([String].self, forKey: .communityLinks) ?? []
        motivation = try c.decodeIfPresent(String.self, forKey: .motivation) ?? ""
        communityDescription = try c.decodeIfPresent(String.self, forKey: .communityDescription)
        audienceSize = try c.decodeIfPresent(Int.self, forKey: .audienceSize)
        invitationCode = try c.decodeIfPresent(String.self, forKey: .invitationCode) ?? ""
        appliedAt = try c.decodeIfPresent(Date.self, forKey: .appliedAt) ?? .distantPast
        rejectionReason = try c.decodeIfPresent(String.self, forKey: .rejectionReason)
        suspensionReason = try c.decodeIfPresent(String.self, forKey: .suspensionReason)
        codeOfConductVersion = try c.decodeIfPresent(String.self, forKey: .codeOfConductVersion)
        codeOfConductAcceptedAt = try c.decodeIfPresent(Date.self, forKey: .codeOfConductAcceptedAt)
    }
}

/// `GET /api/ambassadors/stats`.
///
/// Two plain counts. The route's own comment is worth honouring: neither
/// is estimated, rounded up for effect, or paired with a growth figure
/// ZRP has no baseline to compute honestly - so this screen shows
/// exactly these two numbers and invents no third.
struct AmbassadorStats: Decodable, Equatable {
    let totalAmbassadors: Int
    let countriesRepresented: Int
}

/// One row of `GET /api/ambassadors/countries?lang=…`.
///
/// Every country and territory is present, including those with zero
/// ambassadors - the route is explicit that a country with none is
/// returned with `ambassadors: 0` rather than omitted, and filtering
/// them out here would turn "be the first" into "this country does not
/// exist".
struct AmbassadorCountry: Decodable, Equatable, Identifiable {
    let code: String
    let name: String
    let region: String
    let ambassadors: Int

    /// Always 0 today. There is no Community model and no reliable
    /// per-country membership signal in ZRP yet; the route returns real
    /// zeros rather than invented placeholders, and this app does not
    /// display them for exactly that reason - a row of zeros labelled
    /// "Active Members" reads as a measurement, not as an absence.
    let communities: Int
    let activeMembers: Int

    var id: String { code }

    var regionKey: L10nKey? { AmbassadorRegions.key(for: region) }

    /// The flag for an ISO 3166-1 alpha-2 code, built from regional
    /// indicator symbols. Returns nil for anything that is not two
    /// letters, so a non-standard code renders as no flag rather than
    /// as mojibake.
    var flag: String? {
        let code = code.uppercased()
        guard code.count == 2, code.allSatisfy({ $0.isLetter && $0.isASCII }) else { return nil }
        var scalars = String.UnicodeScalarView()
        for character in code.unicodeScalars {
            guard let scalar = UnicodeScalar(127_397 + character.value) else { return nil }
            scalars.append(scalar)
        }
        return String(scalars)
    }
}

struct AmbassadorCountriesPage: Decodable, Equatable {
    let countries: [AmbassadorCountry]
    let total: Int
}

/// What `POST /api/ambassadors/apply` accepts.
///
/// Every one of these limits is the server's, in
/// `src/lib/ambassadors/validation.ts`. Mirroring them stops someone
/// filling a 3000-character box only to be refused, but the server is
/// what enforces them - including the one that matters most, the Code of
/// Conduct gate, which is checked server-side precisely so a form's own
/// checkbox is never the only thing standing between an application and
/// acceptance.
enum AmbassadorLimits {
    static let cityRegion = 120
    static let motivation = 3000
    static let communityDescription = 3000
    static let maxLanguages = 10
    static let maxCommunityLinks = 5
    static let linkLength = 500
    static let languageLength = 40
    static let maxAudienceSize = 500_000_000
}

/// The region names the countries dataset uses, mapped to the strings
/// the web ambassadors page shows for them.
///
/// A standalone lookup rather than a method on a country, because the
/// region filter needs to label a region it has no country in hand for.
enum AmbassadorRegions {

    /// Web's own order for the filter row.
    static let order = [
        "Africa", "Asia", "Europe", "North America",
        "South America", "Oceania", "Antarctica",
    ]

    static func key(for region: String) -> L10nKey? {
        switch region.lowercased() {
        case "africa": return .ambassadorsRegionAfrica
        case "asia": return .ambassadorsRegionAsia
        case "europe": return .ambassadorsRegionEurope
        case "north america": return .ambassadorsRegionNorthAmerica
        case "south america": return .ambassadorsRegionSouthAmerica
        case "oceania": return .ambassadorsRegionOceania
        case "antarctica": return .ambassadorsRegionAntarctica
        default: return nil
        }
    }
}
