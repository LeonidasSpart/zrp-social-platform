import SwiftUI

@MainActor
final class NewsArticleViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(NewsArticle)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    private let slug: String
    private let repository: NewsRepositoryProtocol

    init(slug: String, repository: NewsRepositoryProtocol = NewsRepository()) {
        self.slug = slug
        self.repository = repository
    }

    func load() async {
        if case .loaded = phase { return }
        phase = .loading
        do {
            phase = .loaded(try await repository.article(slug: slug))
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// One ZRP News article.
///
/// Reading it is what counts a view - the route increments the tally
/// server-side on every fetch, so nothing here reports one separately.
struct NewsArticleView: View {

    @EnvironmentObject private var navigator: Navigator
    @Environment(\.openURL) private var openURL
    @StateObject private var viewModel: NewsArticleViewModel

    init(slug: String) {
        _viewModel = StateObject(wrappedValue: NewsArticleViewModel(slug: slug))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let article):
                article(article)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navNews))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private func article(_ article: NewsArticle) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if let cover = article.coverImage {
                    RemoteImage(url: cover, targetSize: 600) {
                        Rectangle().fill(ZrpColor.surfaceElevated)
                    }
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16.0 / 9.0, contentMode: .fill)
                    .clipped()
                }

                VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                    if let key = article.category.titleKey {
                        Text(key)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.red)
                    }

                    Text(verbatim: article.title)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .fixedSize(horizontal: false, vertical: true)

                    byline(article)

                    if let excerpt = article.excerpt, !excerpt.isEmpty {
                        Text(verbatim: excerpt)
                            .font(.headline)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let content = article.content, !content.isEmpty {
                        // The stored article body, rendered as written.
                        // Paragraph breaks are preserved; no markup is
                        // interpreted, because the route stores plain
                        // text and interpreting it would be inventing a
                        // format the backend does not define.
                        Text(verbatim: content)
                            .font(.body)
                            .foregroundStyle(ZrpColor.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }

                    source(article)
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.bottom, ZrpSpacing.xxl)
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private func byline(_ article: NewsArticle) -> some View {
        HStack(spacing: ZrpSpacing.sm) {
            if let author = article.author {
                Button {
                    navigator.push(.profile(username: author.username))
                } label: {
                    HStack(spacing: ZrpSpacing.xs) {
                        AvatarView(
                            url: author.avatarUrl,
                            displayName: author.displayName,
                            size: ZrpMetrics.avatarSmall
                        )
                        Text(verbatim: author.displayName)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        VerifiedBadge(badgeType: author.badgeType)
                    }
                }
                .buttonStyle(.plain)
            }

            Spacer(minLength: 0)

            if let published = article.publishedAt {
                Text(verbatim: RelativeTime.compact(from: published))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }

    /// The original publication, when the article credits one.
    ///
    /// Opened in the browser: it is somebody else's site, and the app has
    /// no business rendering it as if it were ZRP's.
    @ViewBuilder
    private func source(_ article: NewsArticle) -> some View {
        if let name = article.sourceName, !name.isEmpty {
            if let link = article.sourceUrl, let url = URL(string: link) {
                Button {
                    openURL(url)
                } label: {
                    HStack(spacing: ZrpSpacing.xs) {
                        Image(systemName: "arrow.up.right.square")
                        Text(verbatim: name)
                    }
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            } else {
                Text(verbatim: name)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }
}
