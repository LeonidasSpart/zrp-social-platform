import Foundation

/// One direct message.
///
/// `GET /api/messages/{userId}` returns the full `Message` row plus its
/// `sender`, its `replyTo` (with that message's own sender), and its
/// `reactions`. `receiver` is only included on the conversation-list
/// route's `lastMessage`, so it is optional here.
struct Message: Decodable, Identifiable, Equatable {
    let id: String
    let content: String
    let imageUrl: String?
    let senderId: String
    let receiverId: String
    let read: Bool

    /// Set by the edit route. The web client shows an "Edited" marker
    /// from this, and so does this one - unlike posts, where no such
    /// field exists and no marker is shown.
    let edited: Bool
    let createdAt: Date

    let sender: PostAuthor?

    /// One level deep only: the route includes `replyTo` with its sender,
    /// but not that message's own `replyTo`. Modelled as a separate
    /// non-recursive type for the same reason `QuotedPost` is.
    let replyTo: RepliedMessage?

    /// `var` so the reaction route's own returned list can be swapped in
    /// without refetching the thread. Everything else about a message is
    /// replaced wholesale by the edit route's response.
    var reactions: [MessageReaction]?

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, senderId, receiverId, read, edited
        case createdAt, sender, replyTo, reactions
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        // `content` is non-null in the schema but empty when a message
        // carries only an image.
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        senderId = try container.decode(String.self, forKey: .senderId)
        receiverId = try container.decode(String.self, forKey: .receiverId)
        read = try container.decodeIfPresent(Bool.self, forKey: .read) ?? false
        edited = try container.decodeIfPresent(Bool.self, forKey: .edited) ?? false
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        sender = try container.decodeIfPresent(PostAuthor.self, forKey: .sender)
        replyTo = try container.decodeIfPresent(RepliedMessage.self, forKey: .replyTo)
        reactions = try container.decodeIfPresent([MessageReaction].self, forKey: .reactions)
    }
}

/// The message a reply points at.
struct RepliedMessage: Decodable, Identifiable, Equatable {
    let id: String
    let content: String
    let sender: PostAuthor?

    private enum CodingKeys: String, CodingKey {
        case id, content, sender
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        sender = try container.decodeIfPresent(PostAuthor.self, forKey: .sender)
    }
}

/// A reaction on a message.
///
/// The route enforces **one reaction per person per message**: tapping
/// the same emoji removes it, a different emoji replaces it. That is a
/// genuinely different rule from post reactions, whose unique constraint
/// is [postId, userId, emoji] and so permits several per person.
struct MessageReaction: Decodable, Identifiable, Equatable {
    let id: String
    let emoji: String
    let user: ReactionUser
}

struct ReactionUser: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
}

/// One row of `GET /api/messages` - a bare array, no envelope.
struct ConversationSummary: Decodable, Identifiable, Equatable {
    let partner: PostAuthor
    let lastMessage: Message
    let unreadCount: Int

    var id: String { partner.id }
}

/// `POST /api/messages/reaction/{id}` -> `{action, reactions}`.
struct MessageReactionResponse: Decodable {
    /// `"added"`, `"removed"` or `"changed"`.
    let action: String
    let reactions: [MessageReaction]
}

/// `GET /api/messages/unread` -> `{count}`.
struct UnreadCountResponse: Decodable {
    let count: Int
}
