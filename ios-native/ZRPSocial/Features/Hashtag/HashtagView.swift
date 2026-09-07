import SwiftUI

@MainActor
final class HashtagViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var posts: [Post] = []
    @Published private(set) var phase: Phase = .idle

    let tag: String

    private let repository: UsersRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(tag: String, repository: UsersRepositoryProtocol = UsersRepository()) {
        self.tag = tag
        self.repository = repository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    /// `GET /api/posts/hashtag/{tag}` is genuinely unpaginated - the route
    /// takes 50 and returns a bare array. There is no cursor to follow, so
    /// this screen loads once and offers no "load more" that would have
    /// nothing to load.
    func load() async {
        if posts.isEmpty { phase = .loading }
        do {
            let fetched = try await repository.hashtagPosts(tag: tag)
            posts = fetched
            phase = .loaded
            interactions?.seed(fetched, replacing: true)
        } catch {
            if posts.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// Posts carrying one hashtag.
struct HashtagView: View {

    @EnvironmentObject private var interactions: PostInteractionStore
    @StateObject private var viewModel: HashtagViewModel

    init(tag: String) {
        _viewModel = StateObject(wrappedValue: HashtagViewModel(tag: tag))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded:
                if viewModel.posts.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "number",
                        title: .hashtagNoPosts,
                        subtitle: nil
                    )
                } else {
                    ScrollView {
                        PostListView(
                            posts: viewModel.posts,
                            isLoadingMore: false,
                            // Not paginated by the backend, so the footer
                            // must not claim there is more to come.
                            hasMore: false,
                            header: { EmptyView() }
                        )
                    }
                    .refreshable { await viewModel.load() }
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: "#\(viewModel.tag)"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
    }
}
