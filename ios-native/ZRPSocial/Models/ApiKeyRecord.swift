import Foundation

/// One API key, as `GET /api/api-keys` returns it.
///
/// The key itself is **not** here and never will be: the server stores
/// only a SHA-256 hash, and the plaintext exists exactly once, in the
/// response to the request that created it. Anything that looks like a
/// place to re-read a key later is a mistake.
struct ApiKeyRecord: Decodable, Equatable, Identifiable {
    let id: String
    let name: String
    let lastUsed: Date?
    let expiresAt: Date?
    let createdAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, name, lastUsed, expiresAt, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        lastUsed = try c.decodeIfPresent(Date.self, forKey: .lastUsed)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
    }
}

/// What `POST /api/api-keys` answers with.
///
/// `plainKey` is the only time the token is ever readable. It is held in
/// memory for as long as the confirmation sheet is open and is not
/// persisted anywhere by this app - not to the Keychain, not to
/// `UserDefaults`, not to a log. It belongs to whoever asked for it, to
/// paste where they need it.
struct CreatedApiKey: Decodable, Equatable, Identifiable {
    let key: ApiKeyRecord
    let plainKey: String

    /// The created key's own id, so this can drive a `sheet(item:)`
    /// that appears only when a key genuinely exists to show.
    var id: String { key.id }
}

enum ApiKeyLimits {
    /// `MAX_ACTIVE_KEYS_PER_USER` in the route. Revoked keys do not
    /// count, which is why this is checked against the visible list -
    /// the list excludes revoked keys too.
    static let maxActiveKeys = 10

    /// `DEFAULT_KEY_LIFETIME_DAYS`, applied when none is requested.
    static let defaultLifetimeDays = 365

    /// The three the web dialog offers.
    ///
    /// Web has a fourth, "Never expires" - and it no longer does
    /// anything. The route was fixed so that **every key gets an
    /// expiry**: an omitted `expiresInDays` now means 365 days rather
    /// than forever. Offering "never" here would promise something the
    /// server would quietly override, so it is not offered.
    static let lifetimeChoices = [30, 90, 365]
}
