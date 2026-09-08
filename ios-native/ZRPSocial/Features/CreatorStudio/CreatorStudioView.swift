import SwiftUI

/// Creator Studio, analytics only.
///
/// The website's Studio has three tabs. Two of them are here. The third
/// - Overview - is the earnings surface (balance, tips received, premium
/// post revenue, withdrawal requests), and it is excluded from this app
/// for the same App Store rule 3.1.1 reason as every other money route:
/// `/api/creator/tip` and `/api/creator/withdraw` both refuse a request
/// carrying `x-zrp-native-app`, which every request from this app does.
/// A tab that could only ever show a refusal is worse than an absent
/// tab, and PARITY.md records the decision rather than leaving the gap
/// unexplained.
///
/// Nothing here is derived locally. Views, likes, comments, reposts,
/// the ranking of top posts, the daily buckets and the follower curve
/// are all counted by `/api/creator/studio` from the database; this
/// screen draws exactly what it is sent.
struct CreatorStudioView: View {

    @StateObject private var viewModel = CreatorStudioViewModel()
    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()

            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }

            case .loaded(let studio):
                loaded(studio)
            }
        }
        .navigationTitle(Text(.creatorDashStudioTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private func loaded(_ studio: CreatorStudio) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                Picker("", selection: $viewModel.tab) {
                    ForEach(CreatorStudioViewModel.Tab.allCases, id: \.self) { tab in
                        Text(tab.titleKey).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                switch viewModel.tab {
                case .content: content(studio.content)
                case .audience: audience(studio.audience)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Content

    private func content(_ performance: CreatorContentPerformance) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: ZrpSpacing.md
            ) {
                statCard(.contentPerfViews, performance.totals.views, "eye")
                statCard(.contentPerfLikes, performance.totals.likes, "heart")
                statCard(.contentPerfComments, performance.totals.comments, "bubble.left")
                statCard(
                    .contentPerfReposts,
                    performance.totals.reposts,
                    "arrow.2.squarepath"
                )
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.contentPerfEngagementTitle)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Text(.contentPerfEngagementSubtitle)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                BarChart(
                    values: performance.engagementTrend.map(\.total),
                    firstLabel: performance.engagementTrend.first?.date,
                    lastLabel: performance.engagementTrend.last?.date
                )
                .padding(.top, ZrpSpacing.sm)
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                Text(.contentPerfTopPostsTitle)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)

                if performance.topPosts.isEmpty {
                    Text(.contentPerfNoPostsYet)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, ZrpSpacing.xl)
                } else {
                    // The route already ranks these; `enumerated` is only
                    // for the position label.
                    ForEach(Array(performance.topPosts.enumerated()), id: \.element.id) { index, post in
                        topPostRow(rank: index + 1, post: post)
                    }
                }
            }
        }
    }

    private func topPostRow(rank: Int, post: CreatorTopPost) -> some View {
        Button {
            navigator.push(.postDetail(postId: post.id, preloaded: nil))
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                Text(verbatim: CountFormatting.exact(rank))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(minWidth: 20)

                if let imageUrl = post.imageUrl, !imageUrl.isEmpty {
                    RemoteImage(url: imageUrl, targetSize: 56) {
                        RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous)
                            .fill(ZrpColor.outline)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                }

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    // A post can be image-only, in which case `content`
                    // is empty and the website substitutes "(media
                    // post)" rather than showing a blank row.
                    if post.content.isEmpty {
                        Text(.contentPerfMediaPostFallback)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    } else {
                        Text(verbatim: post.content)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: ZrpSpacing.md) {
                        metric("eye", post.views)
                        metric("heart", post.counts.likes)
                        metric("bubble.left", post.counts.comments)
                        metric("arrow.2.squarepath", post.counts.reposts)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Audience

    private func audience(_ growth: CreatorAudienceGrowth) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: ZrpSpacing.md
            ) {
                statCard(.audienceGrowthTotalFollowers, growth.totalFollowers, "person.2")
                statCard(
                    .audienceGrowthNewLast30Days,
                    growth.newFollowersInWindow,
                    "person.badge.plus",
                    signed: true
                )
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.audienceGrowthFollowerGrowthTitle)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Text(.audienceGrowthFollowerGrowthSubtitle)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                LineChart(
                    values: growth.trend.map(\.totalFollowers),
                    firstLabel: growth.trend.first?.date,
                    lastLabel: growth.trend.last?.date
                )
                .padding(.top, ZrpSpacing.sm)
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                Text(.audienceGrowthNewFollowersPerDayTitle)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)

                BarChart(
                    values: growth.trend.map(\.newFollowers),
                    firstLabel: nil,
                    lastLabel: nil
                )
            }
        }
    }

    // MARK: - Pieces

    private func statCard(
        _ title: L10nKey,
        _ value: Int,
        _ systemImage: String,
        signed: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Label {
                Text(title)
                    .font(.footnote)
            } icon: {
                Image(systemName: systemImage)
            }
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            // Exact rather than abbreviated: this is the screen someone
            // opens *to read the number*. 1.2K is right on a post card
            // and wrong here.
            Text(verbatim: signed && value > 0
                 ? "+" + CountFormatting.exact(value)
                 : CountFormatting.exact(value))
                .font(.title2.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func metric(_ systemImage: String, _ value: Int) -> some View {
        Label {
            Text(verbatim: CountFormatting.exact(value))
        } icon: {
            Image(systemName: systemImage)
        }
        .font(.caption2)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
    }
}

/// A plain bar chart over a fixed series.
///
/// Hand-drawn rather than Swift Charts, which needs iOS 16 for the basics
/// but whose axis and mark API has moved repeatedly since; this is
/// thirty bars with no interaction, and a `GeometryReader`-free
/// proportional stack is both smaller and stable. It carries no
/// dependency either way - Charts is Apple's - but there is nothing here
/// it would do better.
///
/// Values are proportional to the largest in the series, and a zero day
/// still draws a sliver so the axis reads as continuous rather than
/// gapped.
private struct BarChart: View {

    let values: [Int]
    let firstLabel: String?
    let lastLabel: String?

    private var maximum: Int { max(1, values.max() ?? 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(ZrpColor.red.opacity(0.75))
                        .frame(height: barHeight(for: value))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 120, alignment: .bottom)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(ZrpColor.outline)
                    .frame(height: 1)
            }
            // One accessible summary instead of thirty unlabelled
            // rectangles, which is what VoiceOver would otherwise walk
            // through one at a time.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(.contentPerfEngagementTitle))
            .accessibilityValue(Text(verbatim: CountFormatting.exact(values.reduce(0, +))))

            if let firstLabel, let lastLabel {
                HStack {
                    Text(verbatim: firstLabel)
                    Spacer()
                    Text(verbatim: lastLabel)
                }
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }

    private func barHeight(for value: Int) -> CGFloat {
        guard value > 0 else { return 2 }
        return max(4, CGFloat(value) / CGFloat(maximum) * 120)
    }
}

/// The follower curve, drawn as a path over the series.
///
/// Scaled between the window's own minimum and maximum rather than from
/// zero, which is what makes a few new followers on an established
/// account visible at all - and is exactly what the website's own SVG
/// does.
private struct LineChart: View {

    let values: [Int]
    let firstLabel: String?
    let lastLabel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Canvas { context, size in
                guard values.count > 1 else { return }
                let minimum = values.min() ?? 0
                let maximum = values.max() ?? 1
                let range = max(1, maximum - minimum)
                let step = size.width / CGFloat(values.count - 1)

                var path = Path()
                for (index, value) in values.enumerated() {
                    let ratio = CGFloat(value - minimum) / CGFloat(range)
                    // Inset top and bottom so the extremes are not drawn
                    // half outside the frame.
                    let y = size.height - 4 - ratio * (size.height - 8)
                    let point = CGPoint(x: CGFloat(index) * step, y: y)
                    if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
                }
                context.stroke(path, with: .color(ZrpColor.red), lineWidth: 2)
            }
            .frame(height: 120)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(ZrpColor.outline)
                    .frame(height: 1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(.audienceGrowthFollowerGrowthTitle))
            .accessibilityValue(Text(verbatim: CountFormatting.exact(values.last ?? 0)))

            if let firstLabel, let lastLabel {
                HStack {
                    Text(verbatim: firstLabel)
                    Spacer()
                    Text(verbatim: lastLabel)
                }
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }
}
