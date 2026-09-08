import SwiftUI

@MainActor
final class AidViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var campaigns: [HelpCampaign] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    /// `nil` is "All categories".
    @Published var category: HelpCategory? {
        didSet {
            guard oldValue != category else { return }
            Task { await reload() }
        }
    }

    private var cursor: String?
    private let repository: HelpRepositoryProtocol

    init(repository: HelpRepositoryProtocol = HelpRepository()) {
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

    func loadMoreIfNeeded(current: HelpCampaign) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = campaigns.firstIndex(of: current),
            index >= campaigns.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            phase = .loading
            cursor = nil
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.campaigns(
                category: category,
                needType: nil,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                campaigns = page.campaigns
            } else {
                let existing = Set(campaigns.map(\.id))
                campaigns.append(contentsOf: page.campaigns.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if campaigns.isEmpty || replacingExisting {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// ZRP HELP: humanitarian campaigns.
///
/// Browsing is public - `GET /api/help` serves it without a session,
/// exactly as zrp.one/aid does.
///
/// **Creating a campaign is not offered here.** The route allows it only
/// for accounts carrying the `organization` badge, and getting that badge
/// is a manual verification handled off the app. A composer that refused
/// almost everyone who opened it would be worse than none; the website's
/// own page says as much in `help.orgOnlyNote`, which this shows.
struct AidView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = AidViewModel()

    var body: some View {
        VStack(spacing: 0) {
            categories
            Divider().overlay(ZrpColor.outline)
            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navHelp))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var categories: some View {
        ScrollView(.horizontal) {
            HStack(spacing: ZrpSpacing.sm) {
                chip(nil, title: Text(.helpAllCategories))
                ForEach(HelpCategory.selectable) { category in
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

    private func chip(_ category: HelpCategory?, title: Text) -> some View {
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
            if viewModel.campaigns.isEmpty {
                TimelineStateView.empty(
                    systemImage: "heart",
                    title: .helpNoCampaignsYet,
                    subtitle: .helpOrgOnlyNote
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.campaigns) { campaign in
                    Button {
                        navigator.push(.aidCampaign(id: campaign.id))
                    } label: {
                        AidCampaignRow(campaign: campaign)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        Task { await viewModel.loadMoreIfNeeded(current: campaign) }
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

/// One campaign in the list.
struct AidCampaignRow: View {

    let campaign: HelpCampaign

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            if let cover = campaign.imageUrls?.first {
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
                if let key = campaign.category.titleKey {
                    Label {
                        Text(key)
                    } icon: {
                        Image(systemName: campaign.category.systemImage)
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
                }
                if let location = campaign.location, !location.isEmpty {
                    Text(verbatim: location)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                }
            }

            Text(verbatim: campaign.title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let description = campaign.description, !description.isEmpty {
                Text(verbatim: description)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
            }

            AidNeedBadges(needTypes: campaign.needTypes)
            AidProgress(campaign: campaign)
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

/// What a campaign is asking for.
struct AidNeedBadges: View {

    let needTypes: [HelpNeedType]

    var body: some View {
        HStack(spacing: ZrpSpacing.sm) {
            ForEach(needTypes) { need in
                if let key = need.titleKey {
                    Label {
                        Text(key)
                    } icon: {
                        Image(systemName: need.systemImage)
                    }
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .padding(.horizontal, ZrpSpacing.sm)
                    .padding(.vertical, 2)
                    .background(ZrpColor.surfaceElevated, in: Capsule())
                }
            }
        }
    }
}

/// How much has been raised, when the campaign is asking for money.
///
/// Shown for information only. Contributing is a payment, and native
/// clients are refused at `/contribute` by store policy - so there is no
/// control here that could take one.
struct AidProgress: View {

    let campaign: HelpCampaign

    var body: some View {
        if campaign.needTypes.contains(.money),
           let raised = campaign.raisedAmount,
           let goal = campaign.goalAmount {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                // The amounts are the strings the route sent, which are
                // already correct for the campaign's own currency. They
                // are not re-parsed into a float on the way to a label.
                HStack(spacing: ZrpSpacing.xs) {
                    Text(.helpRaised)
                    Text(verbatim: raised)
                    Text(.helpRaisedOf)
                    Text(verbatim: goal)
                    if let currency = campaign.currency {
                        Text(verbatim: currency)
                    }
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

                ProgressView(value: fraction)
                    .tint(ZrpColor.red)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// Only for the bar's width - never for the figures, which are shown
    /// exactly as the server formatted them.
    private var fraction: Double {
        guard
            let raised = Double(campaign.raisedAmount ?? ""),
            let goal = Double(campaign.goalAmount ?? ""),
            goal > 0
        else { return 0 }
        return min(1, max(0, raised / goal))
    }
}
