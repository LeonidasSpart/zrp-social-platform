import SwiftUI

@MainActor
final class PostQuotesViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var posts: [Post] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    private var cursor: String?
    private let postId: String
    private let repository: PostsRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(postId: String, repository: PostsRepositoryProtocol = PostsRepository()) {
        self.postId = postId
        self.repository = repository
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
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(current: Post) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = posts.firstIndex(where: { $0.id == current.id }),
            index >= posts.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if posts.isEmpty { phase = .loading }
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.quotes(
                postId: postId,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                posts = page.posts
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch {
            isLoadingMore = false
            // A failed "load more" must not blank the rows already read.
            if posts.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// The posts that quote one post.
///
/// Rendered with the same card as every other timeline, so a quote can be
/// liked, quoted again, or opened from here exactly as it can anywhere
/// else. A post whose author is private and whom the viewer may not see
/// answers `{items: [], …}` rather than a 403, so an empty list is a
/// legitimate result and shown as the empty state.
struct PostQuotesView: View {

    @EnvironmentObject private var interactions: PostInteractionStore
    @StateObject private var viewModel: PostQuotesViewModel

    init(postId: String) {
        _viewModel = StateObject(wrappedValue: PostQuotesViewModel(postId: postId))
    }

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
                if viewModel.posts.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "quote.bubble",
                        title: .quotesEmpty,
                        subtitle: nil
                    )
                } else {
                    ScrollView {
                        PostListView(
                            posts: viewModel.posts,
                            isLoadingMore: viewModel.isLoadingMore,
                            hasMore: viewModel.hasMore,
                            onAppear: { post in
                                Task { await viewModel.loadMoreIfNeeded(current: post) }
                            },
                            header: { EmptyView() }
                        )
                    }
                    .refreshable { await viewModel.refresh() }
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.quotesTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
    }
}
