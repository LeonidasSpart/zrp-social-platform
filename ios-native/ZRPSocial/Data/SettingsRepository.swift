import Foundation

/// Account settings, moderation and deletion.
///
/// Every call maps to a route the ZRP website already uses. Two contract
/// shapes here are unusual enough to be worth stating, because getting
/// either wrong would be silent:
///
/// - `POST /api/user/delete` is a **toggle**, not a scheduler: it cancels
///   a pending deletion if one exists, and schedules one otherwise.
/// - `POST /api/users/{username}/block` and `POST /api/users/mute` are
///   likewise toggles that return the state the server settled on.
protocol SettingsRepositoryProtocol: Sendable {
    func updatePrivacy(_ request: PrivacyRequest) async throws -> PrivacySettings
    func changePassword(current: String?, new: String) async throws
    func blockedUsers() async throws -> [ModeratedUser]
    func mutedUsers() async throws -> [ModeratedUser]
    func toggleBlock(username: String) async throws -> Bool
    func toggleMute(userId: String) async throws -> Bool
    func report(_ request: ReportRequest) async throws
    func deletionStatus() async throws -> AccountDeletionStatus
    func toggleScheduledDeletion() async throws -> AccountDeletionToggle
    func deleteAccountNow() async throws
    func exportData() async throws -> URL
}

// MARK: - Privacy

struct PrivacyRequest: Encodable {
    let publicLikes: Bool?
    let publicFollowing: Bool?
    let isPrivate: Bool?

    /// Only fields actually present are sent: the route updates each one
    /// only `if (x !== undefined)`, so an omitted key leaves that setting
    /// alone. Sending all three is still correct here because this app's
    /// privacy screen loads and shows all three before saving.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(publicLikes, forKey: .publicLikes)
        try container.encodeIfPresent(publicFollowing, forKey: .publicFollowing)
        try container.encodeIfPresent(isPrivate, forKey: .isPrivate)
    }

    private enum CodingKeys: String, CodingKey {
        case publicLikes, publicFollowing, isPrivate
    }
}

struct PrivacySettings: Decodable, Equatable {
    let publicLikes: Bool
    let publicFollowing: Bool
    let isPrivate: Bool

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        publicLikes = try container.decodeIfPresent(Bool.self, forKey: .publicLikes) ?? true
        publicFollowing = try container.decodeIfPresent(Bool.self, forKey: .publicFollowing) ?? true
        isPrivate = try container.decodeIfPresent(Bool.self, forKey: .isPrivate) ?? false
    }

    init(publicLikes: Bool, publicFollowing: Bool, isPrivate: Bool) {
        self.publicLikes = publicLikes
        self.publicFollowing = publicFollowing
        self.isPrivate = isPrivate
    }

    private enum CodingKeys: String, CodingKey {
        case publicLikes, publicFollowing, isPrivate
    }
}

// MARK: - Moderation

/// A user on the blocked or muted list.
///
/// Both routes return the same shape - the blocked/muted user's own
/// fields, flattened, plus the timestamp under a different key each
/// (`blockedAt` / `mutedAt`), which is why that is decoded from either.
struct ModeratedUser: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?
    let bio: String?
    let followerCount: Int
    let since: Date?

    var displayName: String { name?.isEmpty == false ? name! : username }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try container.decodeIfPresent(String.self, forKey: .username) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        badgeType = try container.decodeIfPresent(String.self, forKey: .badgeType)
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        let counts = try container.decodeIfPresent(Counts.self, forKey: .counts)
        followerCount = counts?.followers ?? 0
        since = try container.decodeIfPresent(Date.self, forKey: .blockedAt)
            ?? container.decodeIfPresent(Date.self, forKey: .mutedAt)
    }

    private struct Counts: Decodable {
        let followers: Int?
    }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, avatarUrl, badgeType, bio
        case blockedAt, mutedAt
        case counts = "_count"
    }
}

/// What is being reported, and why.
///
/// The route requires a `reason` and exactly one target id, and rejects a
/// second pending report of the same thing with 409 - which the UI treats
/// as "already reported" rather than as a failure.
struct ReportRequest: Encodable {
    enum Target: Equatable {
        case post(String)
        case comment(String)
        case listing(String)
    }

    let target: Target
    let reason: ReportReason
    let details: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch target {
        case .post(let id): try container.encode(id, forKey: .postId)
        case .comment(let id): try container.encode(id, forKey: .commentId)
        case .listing(let id): try container.encode(id, forKey: .listingId)
        }
        try container.encode(reason.rawValue, forKey: .reason)
        try container.encodeIfPresent(details, forKey: .details)
    }

    private enum CodingKeys: String, CodingKey {
        case postId, commentId, listingId, reason, details
    }
}

/// The report reasons the website offers.
///
/// The **raw values are the English strings the site stores verbatim** -
/// `Report.reason` is a free-text column that moderators read, not an
/// enum - so they must not be localized on the wire. The label shown to
/// the person is localized; the stored value is not.
enum ReportReason: String, CaseIterable, Identifiable {
    case spam = "Spam"
    case harassment = "Harassment or bullying"
    case inappropriate = "Inappropriate content"
    case misinformation = "Misinformation"
    case hateSpeech = "Hate speech"
    case impersonation = "Impersonation"
    case other = "Other"

    var id: String { rawValue }

    var labelKey: L10nKey {
        switch self {
        case .spam: return .transparencyReasonSpam
        case .harassment: return .transparencyReasonHarassment
        case .inappropriate: return .transparencyReasonInappropriate
        case .misinformation: return .transparencyReasonMisinformation
        case .hateSpeech: return .transparencyReasonHateSpeech
        case .impersonation: return .transparencyReasonImpersonation
        case .other: return .transparencyReasonOther
        }
    }
}

// MARK: - Account deletion

struct AccountDeletionStatus: Decodable, Equatable {
    let requestedAt: Date?
    let scheduledFor: Date?

    var isScheduled: Bool { scheduledFor != nil }
}

/// The result of the schedule/cancel toggle.
///
/// `deletionDate` is present only when a deletion was just scheduled; a
/// cancellation returns the message alone.
struct AccountDeletionToggle: Decodable, Equatable {
    let deletionDate: Date?

    var didSchedule: Bool { deletionDate != nil }
}

// MARK: - Repository

struct SettingsRepository: SettingsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func updatePrivacy(_ request: PrivacyRequest) async throws -> PrivacySettings {
        try await client.send(try Endpoint.put("user/privacy", body: request))
    }

    /// Changes the password.
    ///
    /// `current` is optional because the route allows an account with no
    /// password yet - one created through OAuth - to set one without
    /// proving a previous password it never had. When a password does
    /// exist the route requires and verifies the current one, and this
    /// app always sends it for that case.
    func changePassword(current: String?, new: String) async throws {
        struct Request: Encodable {
            let currentPassword: String?
            let newPassword: String
        }
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "user/password",
                body: Request(currentPassword: current, newPassword: new)
            )
        )
    }

    /// Both lists come back as bare arrays.
    func blockedUsers() async throws -> [ModeratedUser] {
        try await client.send(Endpoint.get("users/blocked"))
    }

    func mutedUsers() async throws -> [ModeratedUser] {
        try await client.send(Endpoint.get("users/muted"))
    }

    /// Toggles a block by username, returning the state the server
    /// settled on. Blocking is mutual-severing server-side: it also drops
    /// any follow in either direction.
    func toggleBlock(username: String) async throws -> Bool {
        struct Response: Decodable { let blocked: Bool }
        let response: Response = try await client.send(
            Endpoint.post("users/\(Endpoint.segment(username))/block")
        )
        return response.blocked
    }

    /// Toggles a mute. Unlike block, this route takes a **user id** in a
    /// JSON body rather than a username in the path.
    func toggleMute(userId: String) async throws -> Bool {
        struct Request: Encodable { let userId: String }
        struct Response: Decodable { let muted: Bool }
        let response: Response = try await client.send(
            try Endpoint.post("users/mute", body: Request(userId: userId))
        )
        return response.muted
    }

    func report(_ request: ReportRequest) async throws {
        try await client.sendIgnoringResponse(try Endpoint.post("reports", body: request))
    }

    func deletionStatus() async throws -> AccountDeletionStatus {
        try await client.send(Endpoint.get("user/delete-status"))
    }

    /// Schedules a deletion 30 days out, or cancels a pending one.
    ///
    /// One route for both, which is why this returns which happened
    /// rather than a bare success: the screen has to say the opposite
    /// thing depending on the answer.
    func toggleScheduledDeletion() async throws -> AccountDeletionToggle {
        try await client.send(Endpoint.post("user/delete"))
    }

    /// Deletes the account immediately and irreversibly.
    ///
    /// The server cascades every post, comment, message, story, track,
    /// album, playlist and listing, removes the uploaded files behind
    /// them, and clears the session cookie. There is no undo, which is
    /// why the screen requires a typed confirmation first - a
    /// requirement this app enforces in the UI, exactly as the website
    /// does, since the route itself accepts a bare POST.
    func deleteAccountNow() async throws {
        try await client.sendIgnoringResponse(Endpoint.post("user/delete/confirm"))
    }

    /// Downloads the account's data export and returns a file URL.
    ///
    /// The route answers with a JSON document and a `Content-Disposition`
    /// filename rather than an API envelope, so it is written to a file
    /// the person can then save or send anywhere - which is what the
    /// download does on the web.
    func exportData() async throws -> URL {
        let data = try await client.sendRaw(Endpoint.get("settings/export-data"))
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-data-export.json")
        try data.write(to: url, options: .atomic)
        return url
    }
}
