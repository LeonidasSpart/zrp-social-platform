import SwiftUI

@MainActor
final class OpportunityViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var listings: [Opportunity] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    @Published var type: OpportunityType? {
        didSet {
            guard oldValue != type else { return }
            Task { await reload() }
        }
    }

    @Published var remoteOnly = false {
        didSet {
            guard oldValue != remoteOnly else { return }
            Task { await reload() }
        }
    }

    private var cursor: String?
    private let repository: OpportunityRepositoryProtocol

    init(repository: OpportunityRepositoryProtocol = OpportunityRepository()) {
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

    func loadMoreIfNeeded(current: Opportunity) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = listings.firstIndex(of: current),
            index >= listings.count - 3
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
            let page = try await repository.listings(
                type: type,
                remoteOnly: remoteOnly,
                query: nil,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                listings = page.listings
            } else {
                let existing = Set(listings.map(\.id))
                listings.append(contentsOf: page.listings.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if listings.isEmpty || replacingExisting {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// ZRP OPPORTUNITY: jobs, internships, scholarships, mentorship,
/// freelance work and collaborations.
///
/// Browsing is public - `GET /api/opportunity` serves it without a
/// session, as zrp.one/opportunity does.
///
/// **Posting a listing is not offered here.** Every listing goes through
/// moderation before it is live (the route creates it as
/// `PENDING_REVIEW`, and the website says so in
/// `opportunity.moderationNote`), and the composer is a long form with a
/// skills editor, a deadline picker and a résumé upload. That belongs in
/// its own phase rather than a partial version of it.
struct OpportunityView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = OpportunityViewModel()

    var body: some View {
        VStack(spacing: 0) {
            filters
            Divider().overlay(ZrpColor.outline)
            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navOpportunity))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var filters: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal) {
                HStack(spacing: ZrpSpacing.sm) {
                    chip(nil, title: Text(.opportunityAllTypes))
                    ForEach(OpportunityType.selectable) { type in
                        if let key = type.titleKey {
                            chip(type, title: Text(key))
                        }
                    }
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)
            }
            .scrollIndicators(.hidden)

            Toggle(isOn: $viewModel.remoteOnly) {
                Text(.opportunityRemoteOnly)
                    .font(.footnote)
            }
            .tint(ZrpColor.red)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.bottom, ZrpSpacing.sm)
        }
    }

    private func chip(_ type: OpportunityType?, title: Text) -> some View {
        let isSelected = viewModel.type == type
        return Button {
            viewModel.type = type
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
            if viewModel.listings.isEmpty {
                TimelineStateView.empty(
                    systemImage: "briefcase",
                    title: .opportunityNoListingsYet,
                    subtitle: nil
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.listings) { listing in
                    Button {
                        navigator.push(.opportunityDetail(id: listing.id))
                    } label: {
                        OpportunityRow(listing: listing)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        Task { await viewModel.loadMoreIfNeeded(current: listing) }
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

/// One listing in the list.
struct OpportunityRow: View {

    let listing: Opportunity

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.sm) {
                if let key = listing.type.titleKey {
                    Text(key)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                if listing.remote == true {
                    Text(.opportunityRemote)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                if listing.isPaid == true {
                    Text(.opportunityIsPaid)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.green)
                }
            }

            Text(verbatim: listing.title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let organization = listing.organizationName, !organization.isEmpty {
                Text(verbatim: organization)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }

            HStack(spacing: ZrpSpacing.md) {
                if let location = listing.location, !location.isEmpty {
                    Text(verbatim: location)
                }
                Text(verbatim: RelativeTime.compact(from: listing.createdAt))
                if listing.applicationCount > 0 {
                    Text(
                        .opportunityViewApplicants,
                        ["n": CountFormatting.exact(listing.applicationCount)]
                    )
                }
            }
            .font(.caption)
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
