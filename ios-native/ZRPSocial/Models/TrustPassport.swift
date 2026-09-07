import Foundation

/// `GET /api/users/{username}/trust` - the ZRP Trust Passport.
///
/// The score and every point value are computed server-side; the route's
/// own comment is explicit that a client must never calculate them. So
/// nothing here derives a score, a level, or a percentage of anything -
/// it displays what the route reports.
///
/// One consequence worth knowing: the signal titles and descriptions are
/// hardcoded ENGLISH in the route, so they arrive in English whatever
/// language the app is set to. The screen's own chrome is translated.
/// The website has the same limitation; see the note in PARITY.md.
struct TrustPassport: Decodable, Equatable {
    let passport: TrustScore
    let user: TrustUser
    let signals: [TrustSignal]
    let additionalSignals: [TrustSignal]
    let counts: TrustCounts

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        passport = try container.decode(TrustScore.self, forKey: .passport)
        user = try container.decode(TrustUser.self, forKey: .user)
        signals = try container.decodeIfPresent([TrustSignal].self, forKey: .signals) ?? []
        additionalSignals = try container
            .decodeIfPresent([TrustSignal].self, forKey: .additionalSignals) ?? []
        counts = try container.decode(TrustCounts.self, forKey: .counts)
    }

    private enum CodingKeys: String, CodingKey {
        case passport, user, signals, additionalSignals, counts
    }
}

struct TrustScore: Decodable, Equatable {
    let score: Int
    let level: Int
    let levelLabel: String
    let maxScore: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        score = try container.decodeIfPresent(Int.self, forKey: .score) ?? 0
        level = try container.decodeIfPresent(Int.self, forKey: .level) ?? 0
        levelLabel = try container.decodeIfPresent(String.self, forKey: .levelLabel) ?? ""
        // The route sends 100 today. Read rather than assumed, so a
        // change to the scale does not silently distort the ring.
        maxScore = try container.decodeIfPresent(Int.self, forKey: .maxScore) ?? 100
    }

    private enum CodingKeys: String, CodingKey {
        case score, level, levelLabel, maxScore
    }

    /// 0…1 for the ring. Guarded because a zero max would otherwise
    /// divide by zero.
    var fraction: Double {
        guard maxScore > 0 else { return 0 }
        return min(1, max(0, Double(score) / Double(maxScore)))
    }
}

struct TrustUser: Decodable, Equatable {
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?
    let createdAt: Date?
    let accountAgeDays: Int
    let accountAgeMonths: Int
    let isPrivate: Bool

    var displayName: String { name?.isEmpty == false ? name! : username }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        username = try container.decode(String.self, forKey: .username)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        badgeType = try container.decodeIfPresent(String.self, forKey: .badgeType)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        accountAgeDays = try container.decodeIfPresent(Int.self, forKey: .accountAgeDays) ?? 0
        accountAgeMonths = try container.decodeIfPresent(Int.self, forKey: .accountAgeMonths) ?? 0
        isPrivate = try container.decodeIfPresent(Bool.self, forKey: .isPrivate) ?? false
    }

    private enum CodingKeys: String, CodingKey {
        case username, name, avatarUrl, badgeType, createdAt
        case accountAgeDays, accountAgeMonths, isPrivate
    }
}

/// One signal. `category` is one of `SECURITY`, `PROFILE`, `HISTORY`,
/// `COMMUNITY`, `ZRP` - the five the website groups by. A category the
/// backend adds later would simply not be grouped, rather than being
/// dropped.
struct TrustSignal: Decodable, Identifiable, Equatable {
    let key: String
    let title: String
    let description: String?
    let verified: Bool
    let category: String?
    let points: Int
    let maxPoints: Int

    var id: String { key }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
        category = try container.decodeIfPresent(String.self, forKey: .category)
        points = try container.decodeIfPresent(Int.self, forKey: .points) ?? 0
        maxPoints = try container.decodeIfPresent(Int.self, forKey: .maxPoints) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case key, title, description, verified, category, points, maxPoints
    }
}

struct TrustCounts: Decodable, Equatable {
    let posts: Int
    let followers: Int
    let following: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        posts = try container.decodeIfPresent(Int.self, forKey: .posts) ?? 0
        followers = try container.decodeIfPresent(Int.self, forKey: .followers) ?? 0
        following = try container.decodeIfPresent(Int.self, forKey: .following) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case posts, followers, following
    }
}
