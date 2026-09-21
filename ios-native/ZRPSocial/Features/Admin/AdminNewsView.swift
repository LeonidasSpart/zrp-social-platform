import SwiftUI

@MainActor
final class AdminNewsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var articles: [AdminNewsArticle] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published var errorMessage: String?

    @Published var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            scheduleSearch()
        }
    }
    @Published var statusFilter: AdminNewsStatusFilter = .all {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
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
        if articles.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentArticle: AdminNewsArticle) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = articles.firstIndex(where: { $0.id == currentArticle.id }),
            index >= articles.count - 5
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
            let result = try await repository.newsArticles(
                status: statusFilter,
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage
            )
            if replacing {
                articles = result.articles
            } else {
                let existing = Set(articles.map(\.id))
                articles.append(contentsOf: result.articles.filter { !existing.contains($0.id) })
            }
            page = result.pagination.page
            totalPages = result.pagination.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if articles.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    func delete(_ article: AdminNewsArticle) async {
        do {
            try await repository.deleteNewsArticle(id: article.id)
            articles.removeAll { $0.id == article.id }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = "Something went wrong. Please try again."
        }
    }

    func inserted(_ article: AdminNewsArticle) {
        articles.insert(article, at: 0)
    }

    func updated(_ article: AdminNewsArticle) {
        guard let index = articles.firstIndex(where: { $0.id == article.id }) else { return }
        articles[index] = article
    }
}

/// ZRP News CMS - the native answer to `/admin/news`. Staff (ADMIN or
/// MODERATOR); this route was previously reachable with **no auth check
/// at all** and was fixed to `requireStaff` in the same pass that built
/// this screen's web page - matches here.
struct AdminNewsView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = AdminNewsViewModel()
    @State private var editingArticle: AdminNewsArticle?
    @State private var isCreating = false
    @State private var confirmingDeleteId: String?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "News"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search title, slug, excerpt, content"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isCreating = true } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel(Text(verbatim: "New article"))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminNewsStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(isPresented: $isCreating) {
                AdminNewsArticleEditorView(
                    existing: nil,
                    defaultAuthorId: session.currentUser?.id ?? "",
                    onSaved: { article in viewModel.inserted(article) }
                )
            }
            .sheet(item: $editingArticle) { article in
                AdminNewsArticleEditorView(
                    existing: article,
                    defaultAuthorId: article.author.id,
                    onSaved: { updated in viewModel.updated(updated) }
                )
            }
            .confirmationDialog(
                Text(verbatim: "Delete this article?"),
                isPresented: Binding(get: { confirmingDeleteId != nil }, set: { if !$0 { confirmingDeleteId = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingDeleteId, let article = viewModel.articles.first(where: { $0.id == id }) {
                        confirmingDeleteId = nil
                        Task { await viewModel.delete(article) }
                    }
                } label: {
                    Text(verbatim: "Delete permanently")
                }
                Button(role: .cancel) { confirmingDeleteId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently deletes the article. This cannot be undone.")
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })
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
            if viewModel.articles.isEmpty {
                AdminEmptyState(systemImage: "newspaper", title: "No articles", subtitle: "Nothing matches this search or filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.articles) { article in
                    row(article)
                        .task { await viewModel.loadMoreIfNeeded(currentArticle: article) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ article: AdminNewsArticle) -> some View {
        Button {
            editingArticle = article
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    if article.featured {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.amber)
                    }
                    Text(verbatim: article.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    AdminStatusChip(status: article.status)
                }
                if let excerpt = article.excerpt, !excerpt.isEmpty {
                    Text(verbatim: excerpt)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(2)
                }
                Text(verbatim: "\(article.category.capitalized) \u{00B7} @\(article.author.username) \u{00B7} \(CountFormatting.exact(article.views)) views \u{00B7} \(RelativeTime.compact(from: article.createdAt))")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .contextMenu {
            Button(role: .destructive) {
                confirmingDeleteId = article.id
            } label: {
                Label { Text(verbatim: "Delete") } icon: { Image(systemName: "trash") }
            }
        }
    }
}
