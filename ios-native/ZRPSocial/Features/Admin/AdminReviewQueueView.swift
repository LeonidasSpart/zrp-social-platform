import SwiftUI

/// Shared by every "user-submitted content awaiting staff approval"
/// screen - Marketplace, Opportunity, HELP campaigns - which really are
/// one screen with different fields. See `AdminReviewableItem`'s own doc
/// comment for why Ads is not included here.
@MainActor
final class AdminReviewQueueViewModel<Item: AdminReviewableItem>: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var items: [Item] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var statusFilter: AdminReviewStatusFilter = .pendingReview {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let fetch: (AdminReviewStatusFilter, Int) async throws -> AdminPageResult<Item>
    private let act: (String, AdminReviewAction, String?) async throws -> Void
    private var page = 1
    private var totalPages = 1
    private var hasLoadedOnce = false

    init(
        fetch: @escaping (AdminReviewStatusFilter, Int) async throws -> AdminPageResult<Item>,
        act: @escaping (String, AdminReviewAction, String?) async throws -> Void
    ) {
        self.fetch = fetch
        self.act = act
    }

    var hasMore: Bool { page < totalPages }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if items.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentItem: Item) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = items.firstIndex(where: { $0.id == currentItem.id }),
            index >= items.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await fetch(statusFilter, requestedPage)
            if replacing {
                items = result.items
            } else {
                let existing = Set(items.map(\.id))
                items.append(contentsOf: result.items.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if items.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func perform(_ item: Item, action: AdminReviewAction, rejectionReason: String?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await act(item.id, action, rejectionReason)
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

/// One review-queue screen, generic over which kind of listing it shows.
struct AdminReviewQueueView<Item: AdminReviewableItem>: View {

    let title: String
    let emptySystemImage: String
    @StateObject private var viewModel: AdminReviewQueueViewModel<Item>
    @State private var selectedItem: Item?

    init(
        title: String,
        emptySystemImage: String,
        fetch: @escaping (AdminReviewStatusFilter, Int) async throws -> AdminPageResult<Item>,
        act: @escaping (String, AdminReviewAction, String?) async throws -> Void
    ) {
        self.title = title
        self.emptySystemImage = emptySystemImage
        _viewModel = StateObject(
            wrappedValue: AdminReviewQueueViewModel(fetch: fetch, act: act)
        )
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminReviewStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedItem) { item in
                AdminReviewActionSheet(item: item) { action, reason in
                    let ok = await viewModel.perform(item, action: action, rejectionReason: reason)
                    if ok { selectedItem = nil }
                    return ok
                } onDismiss: {
                    selectedItem = nil
                }
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
            if viewModel.items.isEmpty {
                AdminEmptyState(systemImage: emptySystemImage, title: "Nothing here", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.items) { item in
                    row(item)
                        .task { await viewModel.loadMoreIfNeeded(currentItem: item) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ item: Item) -> some View {
        Button {
            selectedItem = item
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: item.reviewTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    AdminStatusChip(status: item.status)
                }
                Text(verbatim: item.reviewDetailLine)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: "@\(item.reviewOwner.username)")
                    Text(verbatim: "\u{00B7}")
                    Text(verbatim: RelativeTime.compact(from: item.createdAt))
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                if let reason = item.rejectionReason, !reason.isEmpty {
                    Text(verbatim: "Reason: \(reason)")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.red)
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

/// A status pill, coloured by a small set of well-known words - anything
/// else (a status this app doesn't specifically recognise) still renders,
/// just in the neutral colour, so a future status is never invisible.
struct AdminStatusChip: View {

    let status: String

    private var tint: Color {
        switch status {
        case "PENDING_REVIEW", "PENDING": return ZrpColor.amber
        case "ACTIVE", "APPROVED", "VERIFIED", "COMPLETED": return ZrpColor.green
        case "REJECTED", "REMOVED", "SUSPENDED", "FAILED", "CANCELLED": return ZrpColor.red
        case "PROCESSING", "PAYMENT_PENDING": return ZrpColor.blue
        default: return ZrpColor.onSurfaceMuted
        }
    }

    var body: some View {
        Text(verbatim: status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Approve / reject (with a reason) / remove, for one review-queue item.
struct AdminReviewActionSheet<Item: AdminReviewableItem>: View {

    let item: Item
    let onAct: (AdminReviewAction, String?) async -> Bool
    let onDismiss: () -> Void

    @State private var rejectionReason = ""
    @State private var pendingAction: AdminReviewAction?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: item.reviewTitle) } label: { Text(verbatim: "Title") }
                    LabeledContent { Text(verbatim: "@\(item.reviewOwner.username)") } label: { Text(verbatim: "Submitted by") }
                    Text(verbatim: item.reviewDetailLine)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    LabeledContent { Text(verbatim: RelativeTime.compact(from: item.createdAt)) } label: { Text(verbatim: "Submitted") }
                }

                if let reason = item.rejectionReason, !reason.isEmpty {
                    Section {
                        Text(verbatim: reason)
                    } header: {
                        Text(verbatim: "Existing reason on file")
                    }
                }

                if item.availableReviewActions.contains(.approve) {
                    Section {
                        Button {
                            Task { await act(.approve, reason: nil) }
                        } label: {
                            Text(verbatim: "Approve")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                }

                if item.availableReviewActions.contains(.reject) {
                    Section {
                        TextField("Reason (shown to the submitter)", text: $rejectionReason, axis: .vertical)
                            .lineLimit(2...5)
                        Button(role: .destructive) {
                            pendingAction = .reject
                        } label: {
                            Text(verbatim: "Reject")
                        }
                    } header: {
                        Text(verbatim: "Reject")
                    }
                }

                if item.availableReviewActions.contains(.remove) {
                    Section {
                        TextField("Reason (shown to the submitter)", text: $rejectionReason, axis: .vertical)
                            .lineLimit(2...5)
                        Button(role: .destructive) {
                            pendingAction = .remove
                        } label: {
                            Text(verbatim: "Remove from live")
                        }
                    } header: {
                        Text(verbatim: "Remove")
                    } footer: {
                        Text(verbatim: "Takes this down immediately for a policy violation found after it went live.")
                    }
                }

                if item.availableReviewActions.isEmpty {
                    Section {
                        Text(verbatim: "This item's current status has no available staff action.")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
            }
            .navigationTitle(Text(verbatim: "Review"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: pendingAction == .remove ? "Remove this listing?" : "Reject this submission?"),
                isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let action = pendingAction {
                        pendingAction = nil
                        Task { await act(action, reason: rejectionReason) }
                    }
                } label: {
                    Text(verbatim: pendingAction == .remove ? "Remove" : "Reject")
                }
                Button(role: .cancel) { pendingAction = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "The submitter will see this reason. This cannot be undone from here.")
            }
        }
    }

    private func act(_ action: AdminReviewAction, reason: String?) async {
        _ = await onAct(action, reason)
    }
}
