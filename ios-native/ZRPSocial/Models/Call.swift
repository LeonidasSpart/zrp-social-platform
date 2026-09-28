import Foundation

/// One entry from `GET /api/turn-credentials` (Metered's TURN/STUN
/// credential shape, proxied server-side - see the route's own doc
/// comment for why it's never called unauthenticated and why the
/// underlying secret is never shipped to the client).
///
/// `urls` is decoded leniently as either a single string or an array of
/// strings - Metered's real response mixes both shapes across entries
/// (a STUN row is typically one bare string, a TURN row an array) -
/// mirroring the Android sibling's own `IceServerConfig.urlList()`
/// normalization exactly, rather than assuming one fixed shape and
/// failing decode on a legitimate row using the other.
struct IceServer: Decodable, Equatable {
    let urls: [String]
    let username: String?
    let credential: String?

    private enum CodingKeys: String, CodingKey {
        case urls, username, credential
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let list = try? container.decode([String].self, forKey: .urls) {
            urls = list
        } else if let single = try? container.decode(String.self, forKey: .urls) {
            urls = [single]
        } else {
            urls = []
        }
        username = try? container.decode(String.self, forKey: .username)
        credential = try? container.decode(String.self, forKey: .credential)
    }
}
