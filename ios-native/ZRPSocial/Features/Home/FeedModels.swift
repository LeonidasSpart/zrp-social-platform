import Foundation

/// The viewer's own relationship to a post, held separately from the
/// decoded `Post`.
///
/// It has to live apart from the model because the feed routes do not
/// report all of it. Both feeds attach `liked` per page, but **neither**
/// attaches a per-viewer repost or bookmark flag - only
/// `POST /posts/{id}/repost` and `POST /posts/{id}/bookmark` do, and only
/// for the single post being toggled. So those start as `nil` meaning
/// "the server has not said", which is deliberately different from
/// `false` meaning "not reposted": the UI must not pre-highlight, or
/// pre-un-highlight, state the backend never reported.
struct PostInteraction: Equatable {

    var liked: Bool
    var likeCount: Int
    var reposted: Bool?
    var repostCount: Int
    var bookmarked: Bool?

    /// True while a toggle is in flight, so the control can be disabled
    /// rather than letting a double tap send two racing requests.
    var isMutating: Bool = false

    init(post: Post) {
        liked = post.liked ?? false
        likeCount = post.counts.likes
        reposted = nil
        repostCount = post.counts.reposts
        bookmarked = nil
    }
}

/// One feed tab's paging state.
struct FeedState {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    var posts: [Post] = []
    var cursor: String?
    var phase: Phase = .idle
    var isLoadingMore = false

    /// `nil` cursor after a successful load means the server has no more
    /// pages - distinct from never having loaded, which `phase` covers.
    var hasMore: Bool { cursor != nil }

    var isEmpty: Bool { posts.isEmpty && phase == .loaded }
}
