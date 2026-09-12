import SwiftUI

@MainActor
final class AmbassadorsViewModel: ObservableObject {

    @Published private(set) var stats: AmbassadorStats?
    @Published private(set) var countries: [AmbassadorCountry] = []
    @Published private(set) var isLoading = true
    @Published private(set) var loadError: ApiError?
    @Published var query: String = ""
    @Published var region: String?

    private let repository: AmbassadorsRepositoryProtocol

    init(repository: AmbassadorsRepositoryProtocol = AmbassadorsRepository()) {
        self.repository = repository
    }

    /// The regions present in the data, in the order the web page lists
    /// them. Derived from what came back rather than hardcoded, so a
    /// region the dataset stops using disappears instead of becoming an
    /// empty filter.
    var regions: [String] {
        let present = Set(countries.map(\.region))
        return AmbassadorRegions.order.filter { present.contains($0) }
            + present.subtracting(AmbassadorRegions.order).sorted()
    }

    /// Countries with ambassadors first, then the rest alphabetically.
    ///
    /// A country with none stays in the list: the route returns it as a
    /// real zero on purpose, and dropping it would turn "be the first
    /// ambassador in Chad" into "Chad is not here".
    var visible: [AmbassadorCountry] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return countries
            .filter { country in
                guard region == nil || country.region == region else { return false }
                guard !term.isEmpty else { return true }
                return country.name.lowercased().contains(term)
                    || country.code.lowercased() == term
            }
            .sorted { lhs, rhs in
                if lhs.ambassadors != rhs.ambassadors {
                    return lhs.ambassadors > rhs.ambassadors
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    func load() async {
        isLoading = countries.isEmpty
        loadError = nil

        // Independent: the country explorer is still worth showing when
        // the stats call fails, and the reverse.
        async let statsTask = try? await repository.stats()
        async let countriesTask = try? await repository.countries()
        let (loadedStats, loadedCountries) = await (statsTask, countriesTask)

        stats = loadedStats ?? stats
        if let loadedCountries { countries = loadedCountries }
        isLoading = false

        if stats == nil, countries.isEmpty {
            loadError = .transport(underlying: "ambassadors")
        }
    }
}

/// ZRP Global Ambassadors.
///
/// The web page centres on an interactive world map. This shows the same
/// dataset - the route behind that map, every country and its real
/// approved-ambassador count - as a searchable, region-filterable list.
/// A pannable vector map would mean either a charting dependency or a
/// hand-built projection, and neither tells anyone something the list
/// does not. It is deliberately not described as a map anywhere in the
/// UI.
struct AmbassadorsView: View {

    @StateObject private var viewModel = AmbassadorsViewModel()
    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        Group {
            if let error = viewModel.loadError {
                // Both halves failed. One failing on its own leaves the
                // other on screen rather than blanking the page.
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            } else {
                content
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.ambassadorsNavLabel))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                hero
                levels
                explorer
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(.ambassadorsHeroBadge)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZrpColor.red)

            VStack(alignment: .leading, spacing: 0) {
                Text(.ambassadorsHeroTitle1)
                Text(.ambassadorsHeroTitle2)
                Text(.ambassadorsHeroTitle3)
            }
            .font(.title2.weight(.bold))
            .foregroundStyle(ZrpColor.onSurface)
            .fixedSize(horizontal: false, vertical: true)

            Text(.ambassadorsHeroSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            // Only the two figures the route actually publishes. It says
            // in its own comment that neither is estimated and that
            // there is no honest growth figure to pair them with, so no
            // third number is invented here to fill the row.
            if let stats = viewModel.stats {
                HStack(spacing: ZrpSpacing.md) {
                    figure(
                        CountFormatting.exact(stats.totalAmbassadors),
                        .ambassadorsHeroStatAmbassadors
                    )
                    figure(
                        CountFormatting.exact(stats.countriesRepresented),
                        .ambassadorsHeroStatCountries
                    )
                }
            } else if viewModel.isLoading {
                ProgressView().tint(ZrpColor.red)
            }

            Button { navigator.push(.ambassadorDashboard) } label: {
                Text(.ambassadorsHeroCtaPrimary)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.md)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private func figure(_ value: String, _ label: L10nKey) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(verbatim: value)
                .font(.title.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Levels

    private var levels: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(.ambassadorsLevelsSectionTitle)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Text(.ambassadorsLevelsSectionSubtitle)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(AmbassadorLevel.ladder, id: \.rawValue) { level in
                if let title = level.titleKey, let description = level.descriptionKey {
                    VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        Text(description)
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
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: - Country explorer

    private var explorer: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(.ambassadorsMapSectionTitle)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Text(.ambassadorsMapSectionSubtitle)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            TextField(
                text: $viewModel.query,
                prompt: Text(.ambassadorsMapSearchPlaceholder),
                label: { Text(.ambassadorsMapSearchPlaceholder) }
            )
            .labelsHidden()
            .autocorrectionDisabled()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

            ScrollView(.horizontal) {
                HStack(spacing: ZrpSpacing.sm) {
                    regionChip(nil, label: .ambassadorsMapAllRegions)
                    ForEach(viewModel.regions, id: \.self) { region in
                        regionChip(region, label: nil)
                    }
                }
            }
            .scrollIndicators(.hidden)

            if viewModel.isLoading {
                ProgressView()
                    .tint(ZrpColor.red)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.xl)
            } else if viewModel.visible.isEmpty {
                Text(.ambassadorsMapNoResults)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.xl)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visible) { country in
                        countryRow(country)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func regionChip(_ region: String?, label: L10nKey?) -> some View {
        let isSelected = viewModel.region == region

        Button { viewModel.region = region } label: {
            Group {
                if let label {
                    Text(label)
                } else if let key = region.flatMap(AmbassadorRegions.key(for:)) {
                    Text(key)
                } else {
                    // A region name the app has no string for still
                    // filters correctly; it just shows its raw name.
                    Text(verbatim: region ?? "")
                }
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.xs)
            .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
            .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func countryRow(_ country: AmbassadorCountry) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            if let flag = country.flag {
                Text(verbatim: flag)
                    .font(.title3)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: country.name)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                if let regionKey = country.regionKey {
                    Text(regionKey)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }

            Spacer(minLength: 0)

            // A country with nobody in it says so, and says what to do
            // about it - which is the whole point of publishing a list
            // that includes every country rather than only the covered
            // ones.
            if country.ambassadors > 0 {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(verbatim: CountFormatting.exact(country.ambassadors))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                        .monospacedDigit()
                    Text(.ambassadorsMapLabelAmbassadors)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            } else {
                Text(.ambassadorsMapNoAmbassadorsYet, ["country": country.name])
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 150)
            }
        }
        .padding(.vertical, ZrpSpacing.sm)
        .accessibilityElement(children: .combine)
    }
}
