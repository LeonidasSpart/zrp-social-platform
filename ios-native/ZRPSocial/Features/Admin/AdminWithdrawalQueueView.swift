import SwiftUI

/// Shared by the creator withdrawal queue and the HELP campaign
/// withdrawal queue - both are "list pending payout requests, approve
/// (real on-chain USDC transfer) or reject (refunds the reservation)",
/// differing only in whose balance is on the other end.
@MainActor
final class AdminWithdrawalQueueViewModel<Item: AdminWithdrawalRequest>: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var items: [Item] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?
    /// Shown when the server itself could not confirm the transfer
    /// outcome yet - not an error, but not a clean success either. See
    /// `ApiResult`'s own doc comment.
    @Published var infoMessage: String?

    @Published var statusFilter: AdminWithdrawalStatusFilter = .pending {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let fetch: (AdminWithdrawalStatusFilter) async throws -> [Item]
    private let approveCall: (String) async throws -> ApiResult
    private let rejectCall: (String) async throws -> Void
    private var hasLoadedOnce = false

    init(
        fetch: @escaping (AdminWithdrawalStatusFilter) async throws -> [Item],
        approve: @escaping (String) async throws -> ApiResult,
        reject: @escaping (String) async throws -> Void
    ) {
        self.fetch = fetch
        self.approveCall = approve
        self.rejectCall = reject
    }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if items.isEmpty { phase = .loading }
        do {
            items = try await fetch(statusFilter)
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
    func approve(_ item: Item) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await approveCall(item.id)
            await reload()
            if case .pending(let message) = result {
                infoMessage = message
            }
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            await reload()
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }

    @discardableResult
    func reject(_ item: Item) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await rejectCall(item.id)
            await reload()
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

struct AdminWithdrawalQueueView<Item: AdminWithdrawalRequest>: View {

    let title: String
    /// Shown in the approve confirmation - creator withdrawals spell out
    /// the real, irreversible on-chain transfer explicitly; this is
    /// never softened to a generic "are you sure?".
    let approveWarning: String

    @StateObject private var viewModel: AdminWithdrawalQueueViewModel<Item>
    @State private var confirmingApproveId: String?
    @State private var confirmingRejectId: String?

    init(
        title: String,
        approveWarning: String,
        fetch: @escaping (AdminWithdrawalStatusFilter) async throws -> [Item],
        approve: @escaping (String) async throws -> ApiResult,
        reject: @escaping (String) async throws -> Void
    ) {
        self.title = title
        self.approveWarning = approveWarning
        _viewModel = StateObject(
            wrappedValue: AdminWithdrawalQueueViewModel(fetch: fetch, approve: approve, reject: reject)
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
                        ForEach(AdminWithdrawalStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: "Approve this withdrawal?"),
                isPresented: Binding(get: { confirmingApproveId != nil }, set: { if !$0 { confirmingApproveId = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingApproveId, let item = viewModel.items.first(where: { $0.id == id }) {
                        confirmingApproveId = nil
                        Task { await viewModel.approve(item) }
                    }
                } label: {
                    Text(verbatim: "Approve and send")
                }
                Button(role: .cancel) { confirmingApproveId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: approveWarning)
            }
            .confirmationDialog(
                Text(verbatim: "Reject this withdrawal?"),
                isPresented: Binding(get: { confirmingRejectId != nil }, set: { if !$0 { confirmingRejectId = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingRejectId, let item = viewModel.items.first(where: { $0.id == id }) {
                        confirmingRejectId = nil
                        Task { await viewModel.reject(item) }
                    }
                } label: {
                    Text(verbatim: "Reject")
                }
                Button(role: .cancel) { confirmingRejectId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "The reserved amount is returned to the balance it was held from.")
            }
            .alert(
                Text(verbatim: "Outcome uncertain"),
                isPresented: Binding(get: { viewModel.infoMessage != nil }, set: { if !$0 { viewModel.infoMessage = nil } })
            ) {
                Button { viewModel.infoMessage = nil } label: { Text(verbatim: "OK") }
            } message: {
                Text(verbatim: viewModel.infoMessage ?? "")
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
                AdminEmptyState(systemImage: "banknote", title: "No withdrawals", subtitle: "Nothing matches this filter.")
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
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ item: Item) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: "\(item.currency) \(CountFormatting.exact(Int(item.amount)))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                AdminStatusChip(status: item.status)
            }
            Text(verbatim: "@\(item.withdrawalOwner.username)")
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            if let detail = item.withdrawalDetailLine {
                Text(verbatim: detail)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Text(verbatim: item.walletAddress)
                .font(.caption.monospaced())
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .lineLimit(1)
                .truncationMode(.middle)
            if let hash = item.transactionHash {
                Text(verbatim: "Tx: \(hash)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Text(verbatim: RelativeTime.compact(from: item.createdAt))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            if item.status == "PENDING" {
                HStack(spacing: ZrpSpacing.md) {
                    Button {
                        confirmingApproveId = item.id
                    } label: {
                        Text(verbatim: "Approve")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.md)
                            .padding(.vertical, ZrpSpacing.xs)
                            .background(ZrpColor.green, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    Button(role: .destructive) {
                        confirmingRejectId = item.id
                    } label: {
                        Text(verbatim: "Reject")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.md)
                            .padding(.vertical, ZrpSpacing.xs)
                            .background(ZrpColor.surfaceHighest, in: Capsule())
                            .foregroundStyle(ZrpColor.red)
                    }
                }
                .disabled(viewModel.isWorking)
                .padding(.top, 2)
            }
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
