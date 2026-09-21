import SwiftUI

@MainActor
final class AdminSubscriptionsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var rows: [AdminSubscriptionRow] = []
    @Published private(set) var overview: AdminSubscriptionsOverview?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false

    @Published var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            scheduleSearch()
        }
    }
    /// "ALL", "free", "pro", "business", "enterprise".
    @Published var planFilter = "ALL" {
        didSet {
            guard planFilter != oldValue else { return }
            Task { await reload() }
        }
    }
    /// "ALL", "ACTIVE", "EXPIRED", "CANCELED", "PENDING", "PAID", "FREE", "NO_SUBSCRIPTION".
    @Published var statusFilter = "ALL" {
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
        if rows.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentRow: AdminSubscriptionRow) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = rows.firstIndex(where: { $0.id == currentRow.id }),
            index >= rows.count - 5
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
            let result = try await repository.subscriptions(
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                plan: planFilter,
                status: statusFilter,
                page: requestedPage
            )
            if replacing {
                rows = result.subscriptions
            } else {
                let existing = Set(rows.map(\.id))
                rows.append(contentsOf: result.subscriptions.filter { !existing.contains($0.id) })
            }
            page = result.pagination.page
            totalPages = result.pagination.totalPages
            overview = result.overview
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if rows.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// Subscriptions & Billing - the native answer to `/admin/subscriptions`.
/// Admin-only.
///
/// **Deliberately narrower than web**: web also filters by billing
/// interval, payment method and "expiring within N days", and offers a
/// choice of sort order. This screen offers search plus plan and status,
/// which covers finding a specific user or a specific population - the
/// two things a phone-side billing lookup is actually for. See
/// PARITY.md.
struct AdminSubscriptionsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = AdminSubscriptionsViewModel()

    private let planOptions = ["ALL", "free", "pro", "business", "enterprise"]
    private let statusOptions = ["ALL", "ACTIVE", "EXPIRED", "CANCELED", "PENDING", "PAID", "FREE", "NO_SUBSCRIPTION"]

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Subscriptions"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search username, name, email"))
            .task { await viewModel.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            filterBar
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.reload() } }
            case .loaded:
                if viewModel.rows.isEmpty {
                    AdminEmptyState(systemImage: "creditcard", title: "No users", subtitle: "Nothing matches this search or filter.")
                } else {
                    list
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                Picker(selection: $viewModel.planFilter) {
                    ForEach(planOptions, id: \.self) { plan in
                        Text(verbatim: plan == "ALL" ? "All plans" : plan.capitalized).tag(plan)
                    }
                } label: {
                    chip("Plan: \(viewModel.planFilter == "ALL" ? "All" : viewModel.planFilter.capitalized)")
                }
                .pickerStyle(.menu)

                Picker(selection: $viewModel.statusFilter) {
                    ForEach(statusOptions, id: \.self) { status in
                        Text(verbatim: status == "ALL" ? "All statuses" : status.replacingOccurrences(of: "_", with: " ").capitalized).tag(status)
                    }
                } label: {
                    chip("Status: \(viewModel.statusFilter == "ALL" ? "All" : viewModel.statusFilter.replacingOccurrences(of: "_", with: " ").capitalized)")
                }
                .pickerStyle(.menu)

                if let overview = viewModel.overview {
                    Text(verbatim: "\(CountFormatting.exact(overview.paidUsers)) paid \u{00B7} \(CountFormatting.exact(overview.needsReconciliation)) need reconciliation")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(.leading, ZrpSpacing.sm)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
    }

    private func chip(_ title: String) -> some View {
        Text(verbatim: title)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.sm)
            .background(ZrpColor.surfaceHighest, in: Capsule())
            .foregroundStyle(ZrpColor.onSurface)
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.rows) { row in
                    rowView(row)
                        .task { await viewModel.loadMoreIfNeeded(currentRow: row) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func rowView(_ row: AdminSubscriptionRow) -> some View {
        Button {
            navigator.push(.adminSubscriptionDetail(userId: row.userId))
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                AvatarView(url: row.user.avatarUrl, displayName: row.user.username, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: row.user.name?.isEmpty == false ? row.user.name! : row.user.username)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        Spacer(minLength: 0)
                        AdminStatusChip(status: row.status)
                    }
                    Text(verbatim: "@\(row.user.username) \u{00B7} \(row.plan.capitalized)")
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    if let days = row.daysRemaining {
                        Text(verbatim: "\(CountFormatting.exact(days)) days remaining")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    if row.needsReconciliation {
                        Text(verbatim: "Needs reconciliation")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.amber)
                    }
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
