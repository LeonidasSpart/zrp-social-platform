import SwiftUI

@MainActor
final class ModerationTransparencyViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(ModerationTransparency)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    private let repository: TransparencyRepositoryProtocol

    init(repository: TransparencyRepositoryProtocol = TransparencyRepository()) {
        self.repository = repository
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.moderation())
        } catch ApiError.cancelled {
            return
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// ZRP's public moderation record.
///
/// The other half of `/transparency`, and the half iOS never had. Like
/// the charity ledger it works signed out, because a transparency page
/// that only its own users can read is not one.
///
/// Every number here is an aggregate. The route publishes no reporter,
/// no reported user and no content, and this screen has nothing else to
/// show even if it wanted to - which is the point, and is why the
/// route's own privacy note is rendered rather than summarised away.
struct ModerationTransparencyView: View {

    @StateObject private var viewModel = ModerationTransparencyViewModel()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded(let data):
                loaded(data)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.transparencyHeroTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private func loaded(_ data: ModerationTransparency) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                Text(.transparencyHeroSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                headline(data)
                trend(data.series)
                breakdown(
                    heading: .transparencyReasonHeading,
                    rows: data.byReason.map {
                        (id: $0.reason, key: ModerationLabels.reason($0.reason), count: $0.count)
                    }
                )
                breakdown(
                    heading: .transparencyStatusHeading,
                    rows: data.byStatus.map {
                        (id: $0.status, key: ModerationLabels.status($0.status), count: $0.count)
                    }
                )
                breakdown(
                    heading: .transparencyActionHeading,
                    rows: data.byActionType.map {
                        (
                            id: $0.actionType,
                            key: ModerationLabels.action($0.actionType),
                            count: $0.count
                        )
                    }
                )
                appeals(data.appeals)

                // The route's own words about what it does and does not
                // publish. Shown rather than paraphrased: it is the
                // commitment the page exists to make.
                Text(.transparencyPrivacyNote)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Text(
                    .transparencyGeneratedNote,
                    ["date": data.generatedAt.formatted(date: .abbreviated, time: .shortened)]
                )
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Headline figures

    private func headline(_ data: ModerationTransparency) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            HStack(spacing: ZrpSpacing.md) {
                stat(.transparencyTotalReportsLabel, CountFormatting.exact(data.totals.allTime))
                stat(.transparencyLast30DaysLabel, CountFormatting.exact(data.totals.last30Days))
            }
            HStack(spacing: ZrpSpacing.md) {
                stat(.transparencyActionsTakenLabel, CountFormatting.exact(data.actionedCount))
                stat(.transparencyMedianResolutionLabel, medianText(data.medianResolutionHours))
            }
        }
    }

    /// Hours under a day, days above it - the same switch the web page
    /// makes, so the two never disagree about the headline number.
    ///
    /// An em dash when the route reports null. That is not zero: it
    /// means no report has ever been actioned, and printing "0h" would
    /// claim instant moderation of nothing.
    private func medianText(_ hours: Double?) -> String {
        guard let hours else { return "—" }
        if hours >= 24 {
            let days = Int((hours / 24).rounded())
            return L10n.string(.transparencyDaysValue, ["n": CountFormatting.exact(days)])
        }
        return L10n.string(
            .transparencyHoursValue,
            ["n": CountFormatting.exact(Int(hours.rounded()))]
        )
    }

    private func stat(_ label: L10nKey, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(verbatim: value)
                .font(.title2.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    // MARK: - Trend

    /// Twelve months of received-vs-actioned as paired bars.
    ///
    /// Drawn with rectangles rather than by adding a charting
    /// dependency. Both series share one scale - the largest value
    /// across both - because scaling them independently would make a
    /// month with 3 actions out of 300 reports look like near-total
    /// enforcement.
    @ViewBuilder
    private func trend(_ series: [ModerationTransparency.MonthPoint]) -> some View {
        let peak = max(1, series.flatMap { [$0.received, $0.actioned] }.max() ?? 1)

        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.transparencyTrendHeading)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            HStack(spacing: ZrpSpacing.md) {
                legend(.transparencyReportsReceivedLegend, ZrpColor.onSurfaceMuted)
                legend(.transparencyReportsActionedLegend, ZrpColor.red)
            }

            HStack(alignment: .bottom, spacing: ZrpSpacing.xs) {
                ForEach(series) { point in
                    VStack(spacing: ZrpSpacing.xs) {
                        HStack(alignment: .bottom, spacing: 1) {
                            bar(point.received, peak: peak, color: ZrpColor.onSurfaceMuted)
                            bar(point.actioned, peak: peak, color: ZrpColor.red)
                        }
                        Text(verbatim: ModerationLabels.month(point.month))
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                            // Twelve labels across a phone is tight, so
                            // they shrink - but from a Dynamic Type
                            // style, so they still grow with the
                            // reader's setting rather than being pinned
                            // to 8pt forever.
                            .minimumScaleFactor(0.5)
                    }
                    .frame(maxWidth: .infinity)
                    // The bars are decoration; the numbers are the
                    // content, so VoiceOver gets them as words.
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(verbatim: ModerationLabels.month(point.month)))
                    .accessibilityValue(
                        Text(verbatim: [
                            "\(L10n.string(.transparencyReportsReceivedLegend)): \(point.received)",
                            "\(L10n.string(.transparencyReportsActionedLegend)): \(point.actioned)",
                        ].joined(separator: ", "))
                    )
                }
            }
            .frame(height: 96, alignment: .bottom)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func bar(_ value: Int, peak: Int, color: Color) -> some View {
        // A real zero draws nothing; any non-zero value keeps a visible
        // sliver so "a few" never renders identically to "none".
        let fraction = Double(value) / Double(peak)
        let height = value == 0 ? 0 : max(2, 72 * fraction)
        return RoundedRectangle(cornerRadius: 1)
            .fill(color)
            .frame(width: 5, height: height)
    }

    private func legend(_ label: L10nKey, _ color: Color) -> some View {
        HStack(spacing: ZrpSpacing.xs) {
            RoundedRectangle(cornerRadius: 1).fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    // MARK: - Breakdowns

    /// One labelled bar per category, as a share of the largest.
    ///
    /// A category the route reports at zero is still listed. The route
    /// normalises every taxonomy so absent categories appear as zero on
    /// purpose - "no hate-speech reports this year" is information, and
    /// dropping the row would hide it.
    @ViewBuilder
    private func breakdown(
        heading: L10nKey,
        rows: [(id: String, key: L10nKey?, count: Int)]
    ) -> some View {
        let peak = max(1, rows.map(\.count).max() ?? 1)

        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(heading)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            ForEach(rows, id: \.id) { row in
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    HStack {
                        // An unrecognised taxonomy value shows its raw
                        // form rather than vanishing: it is still real
                        // reports, and hiding it would contradict the
                        // totals above.
                        if let key = row.key {
                            Text(key)
                        } else {
                            Text(verbatim: row.id)
                        }
                        Spacer(minLength: ZrpSpacing.md)
                        Text(verbatim: CountFormatting.exact(row.count))
                            .monospacedDigit()
                    }
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)

                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule().fill(ZrpColor.surfaceHighest)
                            Capsule()
                                .fill(ZrpColor.red)
                                .frame(
                                    width: row.count == 0
                                        ? 0
                                        : geometry.size.width * (Double(row.count) / Double(peak))
                                )
                        }
                    }
                    .frame(height: 4)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func appeals(_ appeals: ModerationTransparency.Appeals) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.transparencyAppealsHeading)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            Text(.transparencyAppealsNote)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: ZrpSpacing.md) {
                appealFigure(.appealsStatusPending, appeals.pending, ZrpColor.onSurfaceMuted)
                appealFigure(.appealsStatusUpheld, appeals.upheld, ZrpColor.green)
                appealFigure(.appealsStatusOverturned, appeals.overturned, ZrpColor.amber)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func appealFigure(_ label: L10nKey, _ value: Int, _ tint: Color) -> some View {
        VStack(spacing: ZrpSpacing.xs) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.title3.weight(.bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
