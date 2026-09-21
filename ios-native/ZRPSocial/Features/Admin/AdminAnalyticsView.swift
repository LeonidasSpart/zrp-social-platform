import SwiftUI

@MainActor
final class AdminAnalyticsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var analytics: AdminAnalytics?
    @Published private(set) var phase: Phase = .loading
    @Published var range: AdminAnalyticsRange = .thirtyDays {
        didSet {
            guard range != oldValue else { return }
            Task { await load() }
        }
    }

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard analytics == nil else { return }
        await load()
    }

    func load() async {
        if analytics == nil { phase = .loading }
        do {
            analytics = try await repository.analytics(range: range)
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// Platform analytics - the native answer to `/admin/analytics`.
/// Admin-only. The geography/acquisition/platform/language breakdown
/// companion page is Android-only for now and out of scope here too.
struct AdminAnalyticsView: View {

    @StateObject private var viewModel = AdminAnalyticsViewModel()

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Analytics"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.range) {
                        ForEach(AdminAnalyticsRange.allCases) { range in
                            Text(verbatim: range.displayName).tag(range)
                        }
                    } label: {
                        Text(verbatim: viewModel.range.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .loaded:
            if let analytics = viewModel.analytics {
                ScrollView {
                    VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                        summaryGrid(analytics.summary)
                        engagementSection(analytics.engagement)
                        topPostsSection(analytics.topPosts)
                    }
                    .padding(ZrpSpacing.lg)
                }
                .refreshable { await viewModel.load() }
            }
        }
    }

    private func summaryGrid(_ summary: AdminAnalyticsSummary) -> some View {
        let cards: [(String, Int)] = [
            ("Users", summary.users),
            ("Posts", summary.posts),
            ("Comments", summary.comments),
            ("Likes", summary.likes),
            ("Reposts", summary.reposts),
        ]
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: ZrpSpacing.md) {
            ForEach(cards, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: CountFormatting.exact(value))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.red)
                    Text(verbatim: label)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private func engagementSection(_ engagement: AdminAnalyticsEngagement) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: "Engagement")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .textCase(.uppercase)
            Text(verbatim: "\(String(format: "%.1f", engagement.avgLikesPerPost)) avg likes/post \u{00B7} \(String(format: "%.1f", engagement.avgCommentsPerPost)) avg comments/post")
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
        }
    }

    private func topPostsSection(_ posts: [AdminAnalyticsTopPost]) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: "Top posts by engagement")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                ForEach(posts) { post in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: post.content)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(2)
                        Text(verbatim: "@\(post.author.username) \u{00B7} \(CountFormatting.exact(post.counts.likes)) likes \u{00B7} \(CountFormatting.exact(post.counts.comments)) comments \u{00B7} \(CountFormatting.exact(post.counts.reposts)) reposts")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .padding(ZrpSpacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
                    }
                }
            }
            .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}
