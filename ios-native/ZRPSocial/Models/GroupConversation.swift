import Foundation

/// A group conversation, from `GET /api/conversations`.
///
/// Groups are a separate route from 1:1 messages on purpose: `GET
/// /api/messages` filters on `conversationId IS NULL`, so it returns
/// direct threads only and always will. An inbox that shows both has to
/// ask for both - which is why this app showed an incomplete inbox, and
/// a Messages badge that could never be cleared, for as long as it asked
/// only the first.
struct GroupConversation: Decodable, Identifiable, Equatable, Hashable {
    let id: String

    /// Groups are always named at creation (the route rejects an empty
    /// name with a 400), but the column is nullable, so this is too.
    let name: String?
    let avatarUrl: String?
    let participantCount: Int

    /// `nil` for a group nobody has written in yet.
    let lastMessage: GroupMessage?

    /// Computed server-side from this member's own `lastReadAt`, not
    /// from per-message read rows - a group message has no single
    /// recipient to carry one.
    let unreadCount: Int

    /// When this group last saw activity, for sorting one inbox that
    /// holds both kinds of conversation.
    ///
    /// A group with no messages sorts by nothing rather than to the top:
    /// `Date.distantPast` puts a silent group below every thread that
    /// has actually been used, which is where someone looking for a
    /// conversation expects it.
    var sortDate: Date { lastMessage?.createdAt ?? .distantPast }
}

/// One message in a group thread.
///
/// Deliberately its own type rather than a reuse of `Message`. The group
/// route's `GROUP_MESSAGE_INCLUDE` attaches only `sender` - no
/// `replyTo`, no `reactions`, and `receiverId` is meaningless for a
/// group (the schema's own KDoc says so). Decoding this as a `Message`
/// would produce a value whose absent fields look like "none" rather
/// than "not sent", and a card that offered reactions with nothing
/// behind them.
struct GroupMessage: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let content: String
    let imageUrl: String?
    let senderId: String
    let createdAt: Date
    let edited: Bool
    let sender: PostAuthor?

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, senderId, createdAt, edited, sender
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        // Non-null in the schema but empty when a message carries only
        // an attachment.
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        senderId = try container.decode(String.self, forKey: .senderId)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        edited = try container.decodeIfPresent(Bool.self, forKey: .edited) ?? false
        sender = try container.decodeIfPresent(PostAuthor.self, forKey: .sender)
    }
}

/// `{items, nextCursor}` - one page of a group thread, oldest first.
///
/// Unlike `GET /api/messages/{userId}`, this route has no legacy bare-
/// array shape to stay compatible with: it was born paginated.
struct GroupMessagesPage: Decodable, Equatable {
    let items: [GroupMessage]
    let nextCursor: String?
}

/// A member of a group, from `GET /api/conversations/{id}`.
struct GroupParticipant: Decodable, Identifiable, Equatable, Hashable {
    let userId: String
    let role: GroupRole
    let user: PostAuthor?

    var id: String { userId }
}

/// `ConversationRole` in the schema.
///
/// The distinction is load-bearing rather than cosmetic: only an OWNER
/// may rename a group, remove another member, or delete someone else's
/// message. Every one of those is enforced server-side with a 403; this
/// exists so the app offers a control only where the route would honour
/// it, rather than letting the refusal be how anyone finds out.
enum GroupRole: String, Decodable, Equatable, Hashable {
    case owner = "OWNER"
    case member = "MEMBER"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GroupRole(rawValue: raw.uppercased()) ?? .unknown
    }
}

/// `GET /api/conversations/{id}` - the group plus its members.
struct GroupConversationDetail: Decodable, Equatable {
    let id: String
    let name: String?
    let avatarUrl: String?
    let participants: [GroupParticipant]

    /// This viewer's own role, derived from the participant list rather
    /// than trusted from a separate field - there is only one source for
    /// it and this keeps them from disagreeing.
    func role(of userId: String?) -> GroupRole {
        guard let userId else { return .unknown }
        return participants.first { $0.userId == userId }?.role ?? .unknown
    }
}

/// One row of the unified inbox.
///
/// Web builds the same merged list in `src/lib/unifiedConversations.ts`.
/// This mirrors that idea without importing its rules: the two kinds of
/// conversation stay distinct values, and only the sort key is shared.
enum InboxEntry: Identifiable, Equatable {
    case direct(ConversationSummary)
    case group(GroupConversation)

    var id: String {
        switch self {
        // Prefixed because a group id and a user id are different
        // namespaces that could, in principle, collide - and a duplicate
        // id in a SwiftUI List silently drops a row.
        case .direct(let summary): return "direct:\(summary.partner.id)"
        case .group(let conversation): return "group:\(conversation.id)"
        }
    }

    var sortDate: Date {
        switch self {
        case .direct(let summary): return summary.lastMessage.createdAt
        case .group(let conversation): return conversation.sortDate
        }
    }

    var unreadCount: Int {
        switch self {
        case .direct(let summary): return summary.unreadCount
        case .group(let conversation): return conversation.unreadCount
        }
    }
}
