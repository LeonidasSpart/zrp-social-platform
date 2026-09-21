import SwiftUI

@MainActor
final class AdminPostsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var posts: [AdminPost] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isDeleting = false
    @Published var errorMessage: String?

    @Published var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            scheduleSearch()
        }
    }

    private let repository: AdminRepositoryProtocol
    private var page = 1
    private var totalPages = 1
    private var searchTask: Task<Void, Never>?
    private var hasLoadedOnce = false

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { page < totalPages }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if posts.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentPost: AdminPost) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = posts.firstIndex(where: { $0.id == currentPost.id }),
            index >= posts.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.reload()
        }
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await repository.posts(
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage
            )
            if replacing {
                posts = result.posts
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: result.posts.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if posts.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Removes the row locally on success rather than reloading the whole
    /// page - unlike Users/Reports/Appeals, `DELETE .../posts/{id}` has no
    /// corresponding "what does it look like now" to re-fetch: the row is
    /// simply gone, and a full reload would just be a slower way of
    /// reaching the same list minus one post.
    @discardableResult
    func delete(_ post: AdminPost) async -> Bool {
        guard !isDeleting else { return false }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await repository.deletePost(id: post.id)
            posts.removeAll { $0.id == post.id }
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }
}

/// Staff post moderation - the native answer to `/admin/posts`. Search
/// and delete only; there is no edit route here, and none on web either.
struct AdminPostsView: View {

    @StateObject private var viewModel = AdminPostsViewModel()
    @State private var confirmingDeleteId: String?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Posts"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search post content"))
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: "Delete this post?"),
                isPresented: Binding(
                    get: { confirmingDeleteId != nil },
                    set: { if !$0 { confirmingDeleteId = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingDeleteId, let post = viewModel.posts.first(where: { $0.id == id }) {
                        confirmingDeleteId = nil
                        Task { await viewModel.delete(post) }
                    }
                } label: {
                    Text(verbatim: "Delete permanently")
                }
                Button(role: .cancel) { confirmingDeleteId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently removes the post, its comments, and any media that isn't used elsewhere. This cannot be undone.")
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.posts.isEmpty {
                AdminEmptyState(systemImage: "doc.text.magnifyingglass", title: "No posts", subtitle: "Nothing matches this search.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.posts) { post in
                    row(post)
                        .task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ post: AdminPost) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: "@\(post.author.username)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                if post.type != "POST" {
                    Text(verbatim: post.type.capitalized)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.blue)
                        .padding(.horizontal, ZrpSpacing.sm)
                        .padding(.vertical, 2)
                        .background(ZrpColor.blue.opacity(0.12), in: Capsule())
                }
                Spacer(minLength: 0)
                Text(verbatim: RelativeTime.compact(from: post.createdAt))
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            if !post.content.isEmpty {
                Text(verbatim: post.content)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(4)
            }

            if !post.imageUrls.isEmpty {
                Text(verbatim: "\(post.imageUrls.count) attachment\(post.imageUrls.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            HStack(spacing: ZrpSpacing.md) {
                Text(verbatim: "\(CountFormatting.exact(post.counts.likes)) likes")
                Text(verbatim: "\(CountFormatting.exact(post.counts.comments)) comments")
                Text(verbatim: "\(CountFormatting.exact(post.counts.reposts)) reposts")
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            Button(role: .destructive) {
                confirmingDeleteId = post.id
            } label: {
                Label { Text(verbatim: "Delete") } icon: { Image(systemName: "trash") }
                    .font(.caption.weight(.semibold))
            }
            .disabled(viewModel.isDeleting)
            .padding(.top, 2)
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
