import Foundation

/// A team role. The account holder is not a `TeamMember` row at all -
/// the route synthesises them as `OWNER` - so `owner` never arrives from
/// the members list and cannot be edited or removed through it.
enum TeamRole: String, Decodable, Equatable, CaseIterable, Identifiable {
    case owner = "OWNER"
    case admin = "ADMIN"
    case editor = "EDITOR"
    case viewer = "VIEWER"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TeamRole(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .owner: return .teamRoleOwner
        case .admin: return .teamRoleAdmin
        case .editor: return .teamRoleEditor
        case .viewer: return .teamRoleViewer
        case .unknown: return nil
        }
    }

    var descriptionKey: L10nKey? {
        switch self {
        case .owner: return .teamRoleOwnerDesc
        case .admin: return .teamRoleAdminDesc
        case .editor: return .teamRoleEditorDesc
        case .viewer: return .teamRoleViewerDesc
        case .unknown: return nil
        }
    }

    /// The three the routes accept on write. `OWNER` is not one of them
    /// - it is synthesised, not stored - and `unknown` would be a 400.
    static let assignable: [TeamRole] = [.admin, .editor, .viewer]
}

/// The person a team membership points at.
struct TeamUser: Decodable, Equatable, Identifiable {
    let id: String
    let username: String?
    let name: String?
    let email: String?
    let avatarUrl: String?
    let plan: String?

    /// Name, then handle, then email - the first thing that exists.
    /// Every one of them is nullable in the route's projection.
    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let username, !username.isEmpty { return "@" + username }
        return email ?? ""
    }
}

/// One row of `GET /api/team`.
struct TeamMember: Decodable, Equatable, Identifiable {
    let id: String
    let role: TeamRole
    let createdAt: Date?
    let user: TeamUser?

    private enum CodingKeys: String, CodingKey {
        case id, role, createdAt, user
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        role = try c.decode(TeamRole.self, forKey: .role)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        user = try c.decodeIfPresent(TeamUser.self, forKey: .user)
    }
}

/// The account holder, as the route reports them.
///
/// Not a `TeamMember`: they have no membership row, no `id` of that
/// kind, and no join date. Modelling them as one would invite code that
/// tried to change their role or remove them - neither of which has a
/// row to act on.
struct TeamOwner: Decodable, Equatable {
    let id: String?
    let username: String?
    let name: String?
    let email: String?
    let avatarUrl: String?
    let plan: String?

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let username, !username.isEmpty { return "@" + username }
        return email ?? ""
    }
}

struct TeamRoster: Decodable, Equatable {
    let members: [TeamMember]
    let owner: TeamOwner?
}
