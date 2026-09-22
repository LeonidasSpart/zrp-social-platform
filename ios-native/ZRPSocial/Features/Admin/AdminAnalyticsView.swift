import SwiftUI

@MainActor
final class AdminAnalyticsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var analytics: AdminAnalytics?
    /// The geography/acquisition/platform/language breakdown - a
    /// separate call (`GET /admin/analytics/geography`), fetched
    /// alongside `analytics` above with the same selected `range`, and
    /// deliberately a separate failure domain: a failure here never
    /// blanks out the core analytics this screen already loaded
    /// successfully (see `load()`), it just leaves this section absent.
    /// `nil` means "hasn't loaded (yet, or failed)" - there is no
    /// dedicated loading flag for it, matching Android's
    /// `AdminAnalyticsUiState`, since it shares this screen's one
    /// spinner.
    @Published private(set) var geography: AdminAnalyticsGeographyResponse?
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
        // Fetched in parallel, exactly like the website's own
        // Promise.all([analytics, geography]) and Android's own
        // async{}/async{} pair - see this property's own doc comment for
        // why a geography failure doesn't touch `phase`.
        async let analyticsTask = try repository.analytics(range: range)
        async let geographyTask: AdminAnalyticsGeographyResponse? = try? repository.analyticsGeography(range: range)
        do {
            let loadedAnalytics = try await analyticsTask
            let loadedGeography = await geographyTask
            analytics = loadedAnalytics
            geography = loadedGeography
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// Platform analytics - the native answer to `/admin/analytics`, plus
/// (as its own section below the core totals, not a separate screen)
/// the geography/acquisition/platform/language breakdown from `GET
/// /admin/analytics/geography` - ported from the same
/// `src/app/admin/analytics/page.tsx` and matching the section Android's
/// `AdminAnalyticsScreen` already ships. Admin-only.
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
                        if let geography = viewModel.geography {
                            geographySection(geography)
                        }
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

    /// Ported from `src/app/admin/analytics/page.tsx`'s own geography/
    /// acquisition/platform/language section and matching the section
    /// Android's `AdminAnalyticsScreen` already ships for the same `GET
    /// /admin/analytics/geography` payload. `byRegion` is part of the
    /// response but, matching both of those references exactly, is not
    /// rendered by any of the three clients today.
    private func geographySection(_ geo: AdminAnalyticsGeographyResponse) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(verbatim: "Geography & Acquisition")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .textCase(.uppercase)

            breakdownCard(title: "Users by Country") {
                BucketBarList(buckets: geo.geography.byCountry, labelFor: countryBucketLabel)
                if geo.geography.unknownCountryCount > 0 {
                    Text(verbatim: "\(geo.geography.unknownCountryCount) users have no known country")
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(.top, 2)
                }
            }

            breakdownCard(title: "New Users by Country") {
                BucketBarList(buckets: geo.geography.newUsersByCountry, labelFor: countryBucketLabel)
            }

            breakdownCard(title: "Acquisition Source") {
                BucketBarList(buckets: geo.acquisition.bySource, labelFor: sourceBucketLabel)
            }

            breakdownCard(title: "Platform") {
                BucketBarList(buckets: geo.platform.byPlatform, labelFor: platformBucketLabel)
            }

            breakdownCard(title: "Language") {
                BucketBarList(buckets: geo.language.byLanguage, labelFor: languageBucketLabel)
            }
        }
    }

    /// A titled card wrapping one geography/acquisition/platform/
    /// language breakdown - the same `surfaceElevated` card shape every
    /// other section on this screen already uses.
    private func breakdownCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            content()
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Ported from the website's own `BucketList` (and Android's own
/// `BucketBarList` port of it): a label, a proportional bar and the raw
/// count, capped at the top 10 buckets exactly like the website's own
/// `buckets.slice(0, 10)` - the route itself already sorts every
/// breakdown by count descending, so this never re-sorts.
private struct BucketBarList: View {
    let buckets: [AdminAnalyticsCountBucket]
    let labelFor: (String) -> String

    var body: some View {
        if buckets.isEmpty {
            Text(verbatim: "-")
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        } else {
            let maxCount = max(buckets.map(\.count).max() ?? 1, 1)
            VStack(spacing: ZrpSpacing.xs) {
                ForEach(buckets.prefix(10)) { bucket in
                    HStack(spacing: ZrpSpacing.sm) {
                        Text(verbatim: labelFor(bucket.key))
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                            .frame(width: 104, alignment: .leading)
                        GeometryReader { proxy in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(ZrpColor.outlineFaint)
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(ZrpColor.red)
                                    .frame(width: max(proxy.size.width * CGFloat(bucket.count) / CGFloat(maxCount), 4))
                            }
                        }
                        .frame(height: 8)
                        Text(verbatim: "\(bucket.count)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .frame(width: 32, alignment: .trailing)
                    }
                }
            }
        }
    }
}

/// `"OTHER"` (the route's own small-cohort privacy fold) and
/// `"UNKNOWN"` (a real null-`countryCode` bucket) are shown as plain
/// English, unlocalized - matching the website's own hard-coded
/// "Other"/"Unknown" there exactly, not a gap unique to this port. A
/// real ISO alpha-2 country code is localized through `Locale`'s own
/// bundled CLDR display-name data for the device's current locale (no
/// bundled country-name dictionary needed here, unlike the website's
/// `i18n-iso-countries` dependency - matching Android's own choice to
/// use its platform's built-in locale data instead of a new
/// dependency), prefixed with a flag built from the regional-indicator
/// Unicode trick, the same flags the website's/Android's own
/// `flagEmoji` produce.
private func countryBucketLabel(_ key: String) -> String {
    if key == AdminAnalyticsBucketKey.other { return "Other" }
    if key == AdminAnalyticsBucketKey.unknown { return "Unknown" }
    guard key.count == 2, key.allSatisfy(\.isLetter) else { return key }
    let regionCode = key.uppercased()
    guard let name = Locale.current.localizedString(forRegionCode: regionCode),
          !name.isEmpty,
          name.caseInsensitiveCompare(key) != .orderedSame
    else {
        return key
    }
    return "\(flagEmoji(regionCode)) \(name)"
}

private func flagEmoji(_ isoAlpha2: String) -> String {
    guard isoAlpha2.count == 2 else { return "" }
    let regionalIndicatorBase: UInt32 = 0x1F1E6 - UnicodeScalar("A").value
    var scalars = String.UnicodeScalarView()
    for scalar in isoAlpha2.uppercased().unicodeScalars {
        guard let flagScalar = UnicodeScalar(regionalIndicatorBase + scalar.value) else { return "" }
        scalars.append(flagScalar)
    }
    return String(scalars)
}

private func sourceBucketLabel(_ key: String) -> String {
    switch key {
    case "REFERRAL": return "Referral"
    case "CAMPAIGN": return "Campaign"
    case AdminAnalyticsBucketKey.unknown: return "Unknown"
    default: return "Direct"
    }
}

private func platformBucketLabel(_ key: String) -> String {
    switch key {
    case "android": return "Android"
    case "ios": return "iOS"
    case AdminAnalyticsBucketKey.unknown: return "Unknown"
    default: return "Web"
    }
}

private func languageBucketLabel(_ key: String) -> String {
    key == AdminAnalyticsBucketKey.unknown ? "Unknown" : key.uppercased()
}
