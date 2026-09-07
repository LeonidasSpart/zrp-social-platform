import Foundation

/// One row of `GET /api/users/{username}/replies`.
///
/// The route builds this shape itself rather than returning a comment:
/// the comment's id and text, its author, the id of the post it belongs
/// to, and just enough of that post to show what was replied to. There
/// are no counts and no viewer flags, so this is not a `Post` and not a
/// `Comment` - modelling it as either would mean inventing values the
/// route never sends.
struct ProfileReply: Decodable, Identifiable, Equatable {

    /// The comment's id, not the post's.
    let id: String
    let content: String
    let createdAt: Date
    let author: PostAuthor

    /// The post this reply lives under - where tapping the row goes.
    let postId: String
    let replyTo: ProfileReplyTarget?
}

/// The replied-to post, as much of it as the replies route sends: an id,
/// the text, and the author's names. No avatar, no badge - so the row
/// shows the context as text rather than pretending to a full card.
struct ProfileReplyTarget: Decodable, Equatable {
    let id: String
    let content: String
    let author: ProfileReplyTargetAuthor
}

struct ProfileReplyTargetAuthor: Decodable, Equatable {
    let username: String
    let name: String?

    var displayName: String { name?.isEmpty == false ? name! : username }
}

struct ProfileRepliesPage: Decodable {
    let items: [ProfileReply]
    let nextCursor: String?
}
