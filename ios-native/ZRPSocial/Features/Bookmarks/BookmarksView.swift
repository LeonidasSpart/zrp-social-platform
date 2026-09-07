import SwiftUI

@MainActor
final class BookmarksViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var items: [BookmarkItem] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    /// Comments unsaved on this screen, hidden immediately rather than
    /// after a refetch. Posts need no equivalent: `PostInteractionStore`
    /// already owns the viewer's bookmark state for every post.
    @Published private(set) var removedCommentIDs: Set<String> = []

    private var cursor: String?
    private let repository: BookmarksRepositoryProtocol
    private let comments: CommentsRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(
        repository: BookmarksRepositoryProtocol = BookmarksRepository(),
        comments: CommentsRepositoryProtocol = CommentsRepository()
    ) {
        self.repository = repository
        self.comments = comments
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
    }

    func refresh() async {
        removedCommentIDs.removeAll()
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(current: BookmarkItem) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = items.firstIndex(of: current),
            index >= items.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    /// Unsaves a comment. The route is a toggle, so a `true` back means
    /// it was not saved after all and the row stays.
    func unbookmark(_ comment: BookmarkedComment) async {
        removedCommentIDs.insert(comment.id)
        do {
            let stillBookmarked = try await comments.toggleBookmark(commentId: comment.id)
            if stillBookmarked { removedCommentIDs.remove(comment.id) }
        } catch {
            removedCommentIDs.remove(comment.id)
        }
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if items.isEmpty { phase = .loading }
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.bookmarks(
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                items = page.items
            } else {
                let existing = Set(items.map(\.id))
                items.append(contentsOf: page.items.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
            // Everything on this page is, by definition, bookmarked -
            // seeding that keeps each card's bookmark control filled in
            // without a second request per post.
            interactions?.seed(page.items.compactMap(\.post), replacing: replacingExisting)
        } catch {
            isLoadingMore = false
            // A failed "load more" must not blank the rows already read.
            if items.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// Everything the viewer has saved: posts and comments in one
/// chronological list, exactly as the website's Bookmarks page shows
/// them.
///
/// The bookmark control has existed on every post card since the feed was
/// built; until now it saved things the app had no way to show. This is
/// the other half of that feature.
struct BookmarksView: View {

    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = BookmarksViewModel()
    @StateObject private var sheets = PostSheetState()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.refresh() }
                }
            case .loaded:
                if visibleItems.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "bookmark",
                        title: .bookmarksEmpty,
                        subtitle: .bookmarksEmptyDesc
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.bookmarksTitle))
        .navigationBarTitleDisplayMode(.inline)
        .postSheets(sheets)
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
    }

    /// A post unbookmarked here disappears, the same way the website's
    /// page refetches after one. Comments do the same through the view
    /// model, which owns their bookmark state - no post-interaction store
    /// covers them.
    private var visibleItems: [BookmarkItem] {
        viewModel.items.filter { item in
            switch item.type {
            case .post:
                guard let post = item.post else { return false }
                return interactions.interaction(for: post).bookmarked ?? true
            case .comment:
                guard let comment = item.comment else { return false }
                return !viewModel.removedCommentIDs.contains(comment.id)
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(visibleItems) { item in
                    row(item)
                        .onAppear {
                            Task { await viewModel.loadMoreIfNeeded(current: item) }
                        }
                }
                footer
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.refresh() }
    }

    @ViewBuilder
    private func row(_ item: BookmarkItem) -> some View {
        if let post = item.post {
            PostRowView(post: post, sheets: sheets)
        } else if let comment = item.comment {
            BookmarkedCommentRow(
                comment: comment,
                onOpen: { navigator.push(.postDetail(postId: comment.postId, preloaded: nil)) },
                onUnbookmark: { Task { await viewModel.unbookmark(comment) } }
            )
        }
    }

    @ViewBuilder
    private var footer: some View {
        if viewModel.isLoadingMore {
            HStack(spacing: ZrpSpacing.sm) {
                ProgressView().tint(ZrpColor.onSurfaceMuted)
                Text(.feedLoadingMore)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(ZrpSpacing.lg)
        } else if !viewModel.hasMore {
            Text(.feedEndOfFeed)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(maxWidth: .infinity)
                .padding(ZrpSpacing.xl)
        }
    }
}

/// A saved comment.
///
/// Opens the post it belongs to - the website links to the same place.
/// Deliberately not the full comment card: this payload carries no
/// counts, no replies and no viewer flags, so a card offering like or
/// reply would be showing controls it has no state for.
private struct BookmarkedCommentRow: View {

    let comment: BookmarkedComment
    let onOpen: () -> Void
    let onUnbookmark: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                // The red leading edge is how the website marks a saved
                // comment apart from a saved post in the same list.
                Rectangle()
                    .fill(ZrpColor.red)
                    .frame(width: 3)

                AvatarView(
                    url: comment.author.avatarUrl,
                    displayName: comment.author.displayName,
                    size: ZrpMetrics.avatarSmall
                )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: comment.author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        Text(verbatim: comment.author.handle)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                        Text(verbatim: RelativeTime.compact(from: comment.createdAt))
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }

                    Text(verbatim: comment.content)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: ZrpSpacing.xs) {
                        Text(.bookmarksReplyingTo)
                        Text(verbatim: "@\(comment.post.author.username)")
                            .foregroundStyle(ZrpColor.red)
                    }
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button(action: onUnbookmark) {
                    Image(systemName: "bookmark.fill")
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.red)
                        .frame(
                            minWidth: ZrpMetrics.minTouchTarget,
                            minHeight: ZrpMetrics.minTouchTarget
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(.iosA11yRemoveBookmark))
            }
            .padding(.vertical, ZrpSpacing.md)
            .padding(.trailing, ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
