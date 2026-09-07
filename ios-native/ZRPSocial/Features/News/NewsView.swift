import SwiftUI

@MainActor
final class NewsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var articles: [NewsArticle] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    /// `nil` is the website's "All" chip.
    @Published var category: NewsCategory? {
        didSet {
            guard oldValue != category else { return }
            Task { await reload() }
        }
    }

    private var cursor: String?
    private let repository: NewsRepositoryProtocol

    init(repository: NewsRepositoryProtocol = NewsRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
    }

    func reload() async {
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(current: NewsArticle) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = articles.firstIndex(of: current),
            index >= articles.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            // A category change replaces the list outright, so the
            // spinner shows even though articles are on screen - leaving
            // the previous category's articles up while the new ones load
            // would read as the filter having done nothing.
            phase = .loading
            cursor = nil
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.articles(
                category: category,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                articles = page.articles
            } else {
                let existing = Set(articles.map(\.id))
                articles.append(contentsOf: page.articles.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if articles.isEmpty || replacingExisting {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// ZRP News.
///
/// The public `GET /api/news` feed, with the same eleven categories and
/// the same "All" default as the website. Nothing here needs a session -
/// the route serves it signed out, exactly as zrp.one/news does.
struct NewsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = NewsViewModel()

    var body: some View {
        VStack(spacing: 0) {
            categories
            Divider().overlay(ZrpColor.outline)
            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navNews))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var categories: some View {
        ScrollView(.horizontal) {
            HStack(spacing: ZrpSpacing.sm) {
                chip(nil, title: Text(.newsCategoryAll))
                ForEach(NewsCategory.selectable) { category in
                    if let key = category.titleKey {
                        chip(category, title: Text(key))
                    }
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ category: NewsCategory?, title: Text) -> some View {
        let isSelected = viewModel.category == category
        return Button {
            viewModel.category = category
        } label: {
            title
                .font(.footnote.weight(isSelected ? .semibold : .regular))
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget - 8)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.reload() }
            }
        case .loaded:
            if viewModel.articles.isEmpty {
                TimelineStateView.empty(
                    systemImage: "newspaper",
                    title: .newsNoNewsTitle,
                    subtitle: .newsNoNewsDesc
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.articles) { article in
                    Button {
                        navigator.push(.newsArticle(slug: article.slug))
                    } label: {
                        NewsRow(article: article)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        Task { await viewModel.loadMoreIfNeeded(current: article) }
                    }
                }

                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(ZrpColor.onSurfaceMuted)
                        .padding(ZrpSpacing.lg)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.reload() }
    }
}

/// One article in the list.
private struct NewsRow: View {

    let article: NewsArticle

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            if let cover = article.coverImage {
                RemoteImage(url: cover, targetSize: 400) {
                    Rectangle().fill(ZrpColor.surfaceElevated)
                }
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .aspectRatio(16.0 / 9.0, contentMode: .fill)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }

            HStack(spacing: ZrpSpacing.sm) {
                if let key = article.category.titleKey {
                    Text(key)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                if article.featured {
                    Text(.newsFeatured)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }

            Text(verbatim: article.title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let excerpt = article.excerpt, !excerpt.isEmpty {
                Text(verbatim: excerpt)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
            }

            HStack(spacing: ZrpSpacing.sm) {
                if let published = article.publishedAt {
                    Text(verbatim: RelativeTime.compact(from: published))
                }
                Text(.newsViewsCount, ["count": CountFormatting.exact(article.views)])
            }
            .font(.caption2)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}
