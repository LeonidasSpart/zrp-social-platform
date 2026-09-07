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

    /// How many times the post has been viewed.
    ///
    /// Not a per-viewer flag like the others: it is a public tally the
    /// list routes send with the post. It lives here rather than being
    /// read off `Post` because counting a view returns the new total,
    /// which then has to show wherever that post appears.
    var viewCount: Int

    /// True while a toggle is in flight, so the control can be disabled
    /// rather than letting a double tap send two racing requests.
    var isMutating: Bool = false

    /// Text from a successful edit, shown in place of the decoded post's
    /// own content.
    ///
    /// The edit route returns the updated post, but the post sits inside
    /// whichever list happens to be holding it - possibly several at
    /// once. Recording the new text here means every screen showing that
    /// post updates together, without any of them knowing about the
    /// others, and survives a refresh the same way the repost and
    /// bookmark flags do.
    var contentOverride: String?

    /// The translated text, once the route has returned one. Kept here
    /// with the rest of a post's per-viewer state so a post translated
    /// in the timeline is still translated when opened, and so a refresh
    /// does not throw the translation away.
    var translation: String?

    /// Whether the translation is being shown in place of the original.
    /// Separate from `translation` so "Show original" can hide it
    /// without discarding it and paying for a second call.
    var isShowingTranslation = false

    /// True while the route is being called, so the control can show
    /// progress and refuse a second tap.
    var isTranslating = false

    /// Set when a translation attempt failed, for one line under the
    /// post. Not an error state for the whole card.
    var translationFailed = false

    init(post: Post) {
        liked = post.liked ?? false
        likeCount = post.counts.likes
        reposted = nil
        repostCount = post.counts.reposts
        bookmarked = nil
        // The following feed omits `views` entirely, so a missing value
        // is zero here rather than a distinct "unknown": there is no
        // per-viewer meaning to preserve, and a tally the server did not
        // send is one the card simply cannot show.
        viewCount = post.views ?? 0
    }
}

/// A poll's state for one viewer: what the server sent, plus whatever
/// this session has done to it.
struct PollVote: Equatable {

    /// Option index (as the string key JSON uses) to vote count.
    var counts: [String: Int]

    /// The option this viewer chose, or `nil` if they have not voted.
    var chosenOption: Int?

    var isVoting = false

    /// The server's own words when a vote is refused - "Already voted",
    /// "Poll has ended". Shown verbatim; they are real rules, not bugs.
    var errorMessage: String?

    init(poll: Poll) {
        counts = poll.votes
        chosenOption = poll.userVote
    }

    var total: Int { counts.values.reduce(0, +) }

    func count(forOption index: Int) -> Int { counts["\(index)"] ?? 0 }

    /// Whole percent of the total, or zero when nobody has voted -
    /// matching the website's own rounding.
    func percent(forOption index: Int) -> Int {
        guard total > 0 else { return 0 }
        return Int((Double(count(forOption: index)) / Double(total) * 100).rounded())
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
