import Foundation
import SwiftUI

/// Local state for one comment: the viewer's like, repost and bookmark,
/// and whether an action is in flight.
///
/// Held apart from the decoded `Comment` for the same reason post
/// interactions are: the tree is immutable once decoded, and rebuilding a
/// nested structure to flip one flag would be both awkward and wasteful.
struct CommentInteraction: Equatable {
    var liked: Bool
    var likeCount: Int
    var reposted: Bool
    var repostCount: Int
    var bookmarked: Bool
    var bookmarkCount: Int

    /// One flag for all three toggles. They hit three different routes,
    /// but a single comment row is a single control group, and letting
    /// one action run while another is settling would make the row's
    /// optimistic counts race against each other.
    var isMutating: Bool = false

    /// Translation state, the same three fields a post carries and for
    /// the same reasons: the fetched text is kept so hiding it does not
    /// discard it, and a failure is one quiet line rather than an alert.
    var translation: String?
    var isShowingTranslation = false
    var isTranslating = false
    var translationFailed = false

    init(comment: Comment) {
        liked = comment.liked ?? false
        likeCount = comment.counts.likes
        reposted = comment.reposted ?? false
        repostCount = comment.counts.reposts
        bookmarked = comment.bookmarked ?? false
        bookmarkCount = comment.counts.bookmarks
    }
}

@MainActor
final class PostDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(Post)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var comments: [Comment] = []
    @Published private(set) var commentsPhase: FeedState.Phase = .idle
    @Published private(set) var isLoadingMoreComments = false
    @Published private(set) var commentInteractions: [String: CommentInteraction] = [:]

    /// The comment being replied to, if any. `nil` means the composer
    /// posts a new top-level comment.
    @Published var replyTarget: Comment?

    @Published var draft: String = ""
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    let postId: String

    private var cursor: String?
    private let postsRepository: PostsRepositoryProtocol
    private let commentsRepository: CommentsRepositoryProtocol
    private let translations: TranslationRepositoryProtocol

    init(
        postId: String,
        postsRepository: PostsRepositoryProtocol = PostsRepository(),
        commentsRepository: CommentsRepositoryProtocol = CommentsRepository(),
        translations: TranslationRepositoryProtocol = TranslationRepository()
    ) {
        self.postId = postId
        self.postsRepository = postsRepository
        self.commentsRepository = commentsRepository
        self.translations = translations
    }

    var post: Post? {
        if case .loaded(let post) = phase { return post }
        return nil
    }

    /// The post's author can turn comments off. The route then answers an
    /// empty page rather than an error, so the flag on the post itself is
    /// what distinguishes "closed" from "none yet".
    var areCommentsEnabled: Bool {
        post?.commentsEnabled ?? true
    }

    var hasMoreComments: Bool { cursor != nil }

    /// Every comment in display order, each with its nesting depth.
    var flattenedComments: [(comment: Comment, depth: Int)] {
        comments.flatMap(\.flattened)
    }

    func interaction(for comment: Comment) -> CommentInteraction {
        commentInteractions[comment.id] ?? CommentInteraction(comment: comment)
    }

    // MARK: - Loading

    func loadIfNeeded(preloaded: Post?) async {
        guard case .loading = phase else { return }

        // Coming from a timeline, the post is already in hand - showing
        // it immediately and refreshing underneath beats a spinner over
        // content the app already has.
        if let preloaded {
            phase = .loaded(preloaded)
        }

        async let postResult: Void = loadPost(showLoading: preloaded == nil)
        async let commentsResult: Void = loadComments(replacingExisting: true)
        _ = await (postResult, commentsResult)
    }

    func refresh() async {
        async let postResult: Void = loadPost(showLoading: false)
        async let commentsResult: Void = loadComments(replacingExisting: true)
        _ = await (postResult, commentsResult)
    }

    private func loadPost(showLoading: Bool) async {
        do {
            let post = try await postsRepository.post(id: postId)
            phase = .loaded(post)
        } catch {
            // A refresh failure over a post already on screen must not
            // replace it with an error.
            guard showLoading || post == nil else { return }
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    func loadMoreCommentsIfNeeded(current: Comment) async {
        guard
            commentsPhase == .loaded,
            hasMoreComments,
            !isLoadingMoreComments,
            // Paging is by top-level thread, so only a root comment
            // reaching the end means "fetch the next threads".
            let index = comments.firstIndex(where: { $0.id == current.id }),
            index >= comments.count - 2
        else { return }
        await loadComments(replacingExisting: false)
    }

    private func loadComments(replacingExisting: Bool) async {
        if replacingExisting {
            if comments.isEmpty { commentsPhase = .loading }
        } else {
            isLoadingMoreComments = true
        }

        do {
            let page = try await commentsRepository.comments(
                postId: postId,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                comments = page.comments
            } else {
                let existing = Set(comments.map(\.id))
                comments.append(contentsOf: page.comments.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            commentsPhase = .loaded
            isLoadingMoreComments = false
            seedInteractions(page.comments)
        } catch {
            isLoadingMoreComments = false
            if comments.isEmpty {
                commentsPhase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                commentsPhase = .loaded
            }
        }
    }

    private func seedInteractions(_ roots: [Comment]) {
        for (comment, _) in roots.flatMap(\.flattened) {
            commentInteractions[comment.id] = CommentInteraction(comment: comment)
        }
    }

    // MARK: - Writing

    func submit() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isSubmitting else { return }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let created = try await commentsRepository.create(
                postId: postId,
                content: content,
                parentId: replyTarget?.id
            )
            insert(created, underParentId: replyTarget?.id)
            commentInteractions[created.id] = CommentInteraction(comment: created)
            draft = ""
            replyTarget = nil
        } catch let error as ApiError {
            // The route validates length against the commenter's own plan
            // and returns that plan's real message, which is far more
            // useful than a generic failure.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    /// Places a new comment into the tree without refetching it.
    ///
    /// A root comment goes to the top, matching the route's own
    /// newest-first ordering for top-level threads. A reply is appended
    /// to its parent's replies, matching the oldest-first ordering the
    /// route uses within a thread.
    private func insert(_ comment: Comment, underParentId parentId: String?) {
        guard let parentId else {
            comments.insert(comment, at: 0)
            return
        }
        comments = comments.map { $0.inserting(comment, under: parentId) }
    }

    /// `POST /api/comments/{id}/like` answers `{liked}`.
    func toggleLike(_ comment: Comment) async {
        await toggle(
            comment,
            optimistic: { state in
                state.liked.toggle()
                state.likeCount = max(0, state.likeCount + (state.liked ? 1 : -1))
            },
            perform: { try await self.commentsRepository.toggleLike(commentId: comment.id) },
            settle: { state, previous, value in
                guard state.liked != value else { return }
                state.liked = value
                state.likeCount = max(0, previous.likeCount + (value ? 1 : 0))
            }
        )
    }

    /// `POST /api/comments/{id}/repost` answers `{reposted}` - the
    /// state after the toggle, which is what settles the optimistic
    /// count below.
    func toggleRepost(_ comment: Comment) async {
        await toggle(
            comment,
            optimistic: { state in
                state.reposted.toggle()
                state.repostCount = max(0, state.repostCount + (state.reposted ? 1 : -1))
            },
            perform: { try await self.commentsRepository.toggleRepost(commentId: comment.id) },
            settle: { state, previous, value in
                guard state.reposted != value else { return }
                state.reposted = value
                state.repostCount = max(0, previous.repostCount + (value ? 1 : 0))
            }
        )
    }

    /// `POST /api/comments/{id}/bookmark` answers `{bookmarked}`.
    func toggleBookmark(_ comment: Comment) async {
        await toggle(
            comment,
            optimistic: { state in
                state.bookmarked.toggle()
                state.bookmarkCount = max(0, state.bookmarkCount + (state.bookmarked ? 1 : -1))
            },
            perform: { try await self.commentsRepository.toggleBookmark(commentId: comment.id) },
            settle: { state, previous, value in
                guard state.bookmarked != value else { return }
                state.bookmarked = value
                state.bookmarkCount = max(0, previous.bookmarkCount + (value ? 1 : 0))
            }
        )
    }

    /// The shared body of the three comment toggles: apply the guess,
    /// call the route, reconcile with the state it reports, and restore
    /// the previous state on failure.
    private func toggle(
        _ comment: Comment,
        optimistic: (inout CommentInteraction) -> Void,
        perform: () async throws -> Bool,
        settle: (inout CommentInteraction, CommentInteraction, Bool) -> Void
    ) async {
        var pending = interaction(for: comment)
        guard !pending.isMutating else { return }
        let previous = pending

        optimistic(&pending)
        pending.isMutating = true
        commentInteractions[comment.id] = pending

        do {
            let value = try await perform()
            var settled = commentInteractions[comment.id] ?? pending
            settle(&settled, previous, value)
            settled.isMutating = false
            commentInteractions[comment.id] = settled
        } catch {
            commentInteractions[comment.id] = previous
            if case ApiError.cancelled = error { return }
            errorMessage = (error as? ApiError)?.userFacingMessage
        }
    }

    /// Shows or hides a translation of one comment.
    ///
    /// The same rules as a post's: the route needs a session, is rate
    /// limited, and refuses text over 2000 characters, so a second tap
    /// only toggles what has already been fetched.
    func toggleTranslation(_ comment: Comment, to targetLang: String) async {
        var state = interaction(for: comment)
        guard !state.isTranslating else { return }

        if state.translation != nil {
            state.isShowingTranslation.toggle()
            commentInteractions[comment.id] = state
            return
        }

        let text = comment.content
        guard
            !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            text.count <= TranslationRepository.maxTextLength
        else {
            state.translationFailed = true
            commentInteractions[comment.id] = state
            return
        }

        state.isTranslating = true
        state.translationFailed = false
        commentInteractions[comment.id] = state

        var settled = commentInteractions[comment.id] ?? state
        do {
            settled.translation = try await translations.translate(text, to: targetLang)
            settled.isShowingTranslation = true
        } catch {
            settled.translationFailed = true
        }
        settled.isTranslating = false
        commentInteractions[comment.id] = settled
    }

    /// Author-only, enforced server-side with a 403.
    func delete(_ comment: Comment) async {
        do {
            try await commentsRepository.delete(commentId: comment.id)
            comments = comments.compactMap { $0.removing(id: comment.id) }
            commentInteractions.removeValue(forKey: comment.id)
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    func edit(_ comment: Comment, to content: String) async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let updated = try await commentsRepository.edit(
                commentId: comment.id,
                content: trimmed
            )
            comments = comments.map { $0.replacingContent(of: updated.id, with: updated.content) }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    func beginReply(to comment: Comment) {
        replyTarget = comment
    }

    func cancelReply() {
        replyTarget = nil
    }
}

// MARK: - Immutable tree edits

private extension Comment {

    /// Returns a copy of this subtree with `comment` appended to the
    /// replies of `parentId`, or unchanged if that parent is elsewhere.
    func inserting(_ comment: Comment, under parentId: String) -> Comment {
        if id == parentId {
            return withReplies(replies + [comment])
        }
        return withReplies(replies.map { $0.inserting(comment, under: parentId) })
    }

    /// Returns a copy of this subtree without the comment with `id`, or
    /// `nil` if this comment is the one being removed - which also drops
    /// its replies, matching the server's cascade.
    func removing(id target: String) -> Comment? {
        if id == target { return nil }
        return withReplies(replies.compactMap { $0.removing(id: target) })
    }

    func replacingContent(of target: String, with newContent: String) -> Comment {
        if id == target {
            return withContent(newContent)
        }
        return withReplies(replies.map { $0.replacingContent(of: target, with: newContent) })
    }
}
