import Foundation

/// One saved item from `GET /api/bookmarks`.
///
/// The route merges two independent tables - post bookmarks and comment
/// bookmarks - into one chronological timeline, so an item carries
/// exactly one of the two payloads and says which in `type`. `id` is the
/// bookmark row's own id, not the post's or comment's.
struct BookmarkItem: Decodable, Identifiable, Equatable {

    enum Kind: String, Decodable {
        case post
        case comment
    }

    let type: Kind
    let id: String
    let createdAt: Date
    let post: Post?
    let comment: BookmarkedComment?
}

/// A saved comment, as `GET /api/bookmarks` selects it.
///
/// Deliberately its own type rather than the app's `Comment`: this route
/// selects neither `_count` nor replies, and nests the parent post with
/// an author narrowed to a name and a username. Reusing `Comment` here
/// would mean loosening a model that every other comment screen depends
/// on being complete.
struct BookmarkedComment: Decodable, Identifiable, Equatable {

    /// The parent post a saved comment replies to. Its author select is
    /// narrower than `PostAuthor` - no id, no avatar - because the web
    /// page only shows the handle it is replying to.
    struct ParentPost: Decodable, Equatable {
        struct Author: Decodable, Equatable {
            let username: String
            let name: String?
        }

        let id: String
        let content: String
        let author: Author
    }

    let id: String
    let content: String
    let createdAt: Date
    let postId: String
    let author: PostAuthor
    let post: ParentPost
}

/// One page of `GET /api/bookmarks`.
struct BookmarksPage: Equatable {
    let items: [BookmarkItem]
    let nextCursor: String?
}
