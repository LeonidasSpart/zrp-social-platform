import SwiftUI

@MainActor
final class AdminAdsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var campaigns: [AdminAdCampaign] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var statusFilter: AdminAdStatusFilter = .pendingReview {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let repository: AdminRepositoryProtocol
    private var page = 1
    private var totalPages = 1
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
        if campaigns.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentCampaign: AdminAdCampaign) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = campaigns.firstIndex(where: { $0.id == currentCampaign.id }),
            index >= campaigns.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await repository.adCampaigns(status: statusFilter, page: requestedPage)
            if replacing {
                campaigns = result.items
            } else {
                let existing = Set(campaigns.map(\.id))
                campaigns.append(contentsOf: result.items.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if campaigns.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func perform(_ campaign: AdminAdCampaign, action: AdminAdAction, rejectionReason: String?, adminNote: String?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.reviewAdCampaign(id: campaign.id, action: action, rejectionReason: rejectionReason, adminNote: adminNote)
            await load(page: page, replacing: true)
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }
}

/// Ad campaign review - the native answer to `/admin/ads`. Not a
/// three-action review queue like Marketplace/Opportunity/HELP: an ad
/// campaign has real money (budget/spend) and a richer lifecycle
/// (`src/lib/ads/lifecycle.ts`), so it gets its own screen.
struct AdminAdsView: View {

    @StateObject private var viewModel = AdminAdsViewModel()
    @State private var selectedCampaign: AdminAdCampaign?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Ads"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminAdStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedCampaign) { campaign in
                AdminAdActionSheet(campaign: campaign, viewModel: viewModel) { selectedCampaign = nil }
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.campaigns.isEmpty {
                AdminEmptyState(systemImage: "megaphone", title: "No campaigns", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.campaigns) { campaign in
                    row(campaign)
                        .task { await viewModel.loadMoreIfNeeded(currentCampaign: campaign) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ campaign: AdminAdCampaign) -> some View {
        Button {
            selectedCampaign = campaign
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: campaign.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    AdminStatusChip(status: campaign.status)
                }
                Text(verbatim: campaign.post.content)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(2)
                Text(verbatim: "\(campaign.bidType) \u{00B7} Spent \(CountFormatting.exact(Int(campaign.budgetSpent))) of \(CountFormatting.exact(Int(campaign.budgetTotal)))")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(verbatim: "@\(campaign.advertiser.username) \u{00B7} \(RelativeTime.compact(from: campaign.createdAt))")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
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

struct AdminAdActionSheet: View {

    let campaign: AdminAdCampaign
    @ObservedObject var viewModel: AdminAdsViewModel
    let onDismiss: () -> Void

    @State private var rejectionReason = ""
    @State private var adminNote: String
    @State private var pendingAction: AdminAdAction?

    init(campaign: AdminAdCampaign, viewModel: AdminAdsViewModel, onDismiss: @escaping () -> Void) {
        self.campaign = campaign
        self.viewModel = viewModel
        self.onDismiss = onDismiss
        _adminNote = State(initialValue: campaign.adminNote ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: campaign.name) } label: { Text(verbatim: "Campaign") }
                    LabeledContent { Text(verbatim: "@\(campaign.advertiser.username)") } label: { Text(verbatim: "Advertiser") }
                    LabeledContent { Text(verbatim: "\(campaign.bidType) \u{00B7} \(CountFormatting.exact(Int(campaign.bidAmount)))") } label: { Text(verbatim: "Bid") }
                    LabeledContent { Text(verbatim: "\(CountFormatting.exact(Int(campaign.budgetSpent))) / \(CountFormatting.exact(Int(campaign.budgetTotal)))") } label: { Text(verbatim: "Budget spent") }
                    if let url = campaign.targetUrl {
                        LabeledContent { Text(verbatim: url).lineLimit(1) } label: { Text(verbatim: "Target URL") }
                    }
                    Text(verbatim: campaign.post.content)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } header: {
                    Text(verbatim: "Campaign")
                }

                if let reason = campaign.rejectionReason, !reason.isEmpty {
                    Section {
                        Text(verbatim: reason)
                    } header: {
                        Text(verbatim: "Rejection / suspension reason on file")
                    }
                }

                let actions = campaign.availableActions.filter { $0 != .note }
                if !actions.isEmpty {
                    Section {
                        if actions.contains(.reject) || actions.contains(.suspend) || actions.contains(.cancel) {
                            TextField("Reason (shown to the advertiser)", text: $rejectionReason, axis: .vertical)
                                .lineLimit(2...5)
                        }
                        ForEach(actions) { action in
                            Button(role: action == .reject || action == .cancel ? .destructive : nil) {
                                pendingAction = action
                            } label: {
                                Text(verbatim: action.displayName)
                            }
                        }
                    } header: {
                        Text(verbatim: "Actions")
                    }
                }

                Section {
                    TextField("Internal note (staff only, never shown to the advertiser)", text: $adminNote, axis: .vertical)
                        .lineLimit(2...6)
                    Button {
                        Task { await viewModel.perform(campaign, action: .note, rejectionReason: nil, adminNote: adminNote) }
                    } label: {
                        Text(verbatim: "Save note")
                    }
                    .disabled(viewModel.isWorking)
                } header: {
                    Text(verbatim: "Internal note")
                }
            }
            .navigationTitle(Text(verbatim: "Review campaign"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: "\(pendingAction?.displayName ?? "") this campaign?"),
                isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let action = pendingAction {
                        pendingAction = nil
                        Task {
                            if await viewModel.perform(campaign, action: action, rejectionReason: rejectionReason, adminNote: adminNote) {
                                onDismiss()
                            }
                        }
                    }
                } label: {
                    Text(verbatim: pendingAction?.displayName ?? "Confirm")
                }
                Button(role: .cancel) { pendingAction = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This changes the campaign's status immediately.")
            }
        }
    }
}
