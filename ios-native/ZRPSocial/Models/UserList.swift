import Foundation

/// A Twitter/X-style curated list of users - see prisma/schema.prisma's
/// List/ListMember models. Named `UserList` rather than `List` to avoid
/// colliding with SwiftUI's own `List` view. Its feed is derived from
/// its members' authorId, the same reuse pattern as `Community`'s
/// hashtag-derived feed.
struct UserListSummary: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String?
    let isPrivate: Bool
    let memberCount: Int
}

struct UserListMemberEntry: Decodable, Identifiable, Equatable {
    struct MemberUser: Decodable, Equatable {
        let id: String
        let username: String
        let name: String?
        let avatarUrl: String?
        let badgeType: String?
    }

    var id: String { user.id }
    let addedAt: Date
    let user: MemberUser
}

struct UserListDetail: Decodable, Equatable {
    let id: String
    let name: String
    let description: String?
    let isPrivate: Bool
    let ownerId: String
    let members: [UserListMemberEntry]
    let memberCount: Int
}

struct UserListDetailResponse: Decodable {
    let list: UserListDetail
    let isOwner: Bool
}

struct CreateUserListRequest: Encodable {
    let name: String
    let description: String?
    let isPrivate: Bool
}

struct CreateUserListResponse: Decodable {
    let list: UserListSummary
}

struct AddListMemberRequest: Encodable {
    let username: String
}

struct AddListMemberResponse: Decodable {
    let added: Bool
    let alreadyMember: Bool
}
