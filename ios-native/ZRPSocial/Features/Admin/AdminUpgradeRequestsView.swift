import SwiftUI

@MainActor
final class AdminUpgradeRequestsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var requests: [AdminUpgradeRequest] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var statusFilter: AdminUpgradeRequestStatusFilter = .pending {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let repository: AdminRepositoryProtocol
    private var hasLoadedOnce = false

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if requests.isEmpty { phase = .loading }
        do {
            requests = try await repository.upgradeRequests(status: statusFilter)
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if requests.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func approve(_ request: AdminUpgradeRequest, billingInterval: AdminBillingInterval) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.approveUpgradeRequest(id: request.id, billingInterval: billingInterval)
            await reload()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            // A 409 ("already processed") means another admin/tab won the
            // claim - reload so the row reflects that instead of staying
            // stuck showing pending actions for a request that is done.
            await reload()
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }

    @discardableResult
    func deny(_ request: AdminUpgradeRequest) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.denyUpgradeRequest(id: request.id)
            await reload()
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
}

/// The older, pre-Solana manual-upgrade path - admin-only, the native
/// answer to `/admin/upgrade-requests` even though the route itself
/// lives outside `/api/admin/**` (`src/app/api/upgrade-requests/**`).
///
/// **Approving grants or extends the user's plan** in the same
/// transaction as the server-side claim, exactly like a verified
/// payment - the confirmation copy says so explicitly. Denying just
/// marks the request denied; the user keeps their current plan.
struct AdminUpgradeRequestsView: View {

    @StateObject private var viewModel: AdminUpgradeRequestsViewModel
    @State private var approvingRequest: AdminUpgradeRequest?
    @State private var confirmingDenyId: String?

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        _viewModel = StateObject(wrappedValue: AdminUpgradeRequestsViewModel(repository: repository))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Upgrade requests"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminUpgradeRequestStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $approvingRequest) { request in
                AdminUpgradeApproveSheet(
                    request: request,
                    onApprove: { interval in await viewModel.approve(request, billingInterval: interval) }
                )
            }
            .confirmationDialog(
                Text(verbatim: "Deny this upgrade request?"),
                isPresented: Binding(get: { confirmingDenyId != nil }, set: { if !$0 { confirmingDenyId = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingDenyId, let request = viewModel.requests.first(where: { $0.id == id }) {
                        confirmingDenyId = nil
                        Task { await viewModel.deny(request) }
                    }
                } label: {
                    Text(verbatim: "Deny")
                }
                Button(role: .cancel) { confirmingDenyId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "The user keeps their current plan. This cannot be undone from this screen.")
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
            if viewModel.requests.isEmpty {
                AdminEmptyState(systemImage: "arrow.up.circle", title: "No requests", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.requests) { request in
                    row(request)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ request: AdminUpgradeRequest) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: "@\(request.user.username)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                statusChip(request.status)
            }
            Text(verbatim: "Requesting: \(request.requestedPlan.capitalized)")
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurface)
            if let method = request.paymentMethod, !method.isEmpty {
                Text(verbatim: "Payment method: \(method)")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let message = request.message, !message.isEmpty {
                Text(verbatim: message)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(4)
            }
            Text(verbatim: RelativeTime.compact(from: request.createdAt))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            if request.status == "pending" {
                HStack(spacing: ZrpSpacing.md) {
                    Button {
                        approvingRequest = request
                    } label: {
                        Text(verbatim: "Approve")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.md)
                            .padding(.vertical, ZrpSpacing.xs)
                            .background(ZrpColor.green, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    Button(role: .destructive) {
                        confirmingDenyId = request.id
                    } label: {
                        Text(verbatim: "Deny")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.md)
                            .padding(.vertical, ZrpSpacing.xs)
                            .background(ZrpColor.surfaceHighest, in: Capsule())
                            .foregroundStyle(ZrpColor.red)
                    }
                }
                .disabled(viewModel.isWorking)
                .padding(.top, 2)
            } else if let approvedBy = request.approvedBy {
                Text(verbatim: "\(request.status == "approved" ? "Approved" : "Denied") by \(approvedBy)\(request.approvedAt.map { " \u{00B7} \(RelativeTime.compact(from: $0))" } ?? "")")
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }

    private func statusChip(_ status: String) -> some View {
        let tint: Color = {
            switch status {
            case "pending": return ZrpColor.amber
            case "approved": return ZrpColor.green
            case "denied": return ZrpColor.red
            default: return ZrpColor.onSurfaceMuted
            }
        }()
        return Text(verbatim: status.capitalized)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Picking the billing interval before approving one pending request -
/// this legacy request never collects one, so the admin sets it here.
/// The sheet's footer explains what approving does; the destructive
/// `.confirmationDialog` triggered from the approve button is the
/// actual point of no return.
struct AdminUpgradeApproveSheet: View {

    let request: AdminUpgradeRequest
    let onApprove: (AdminBillingInterval) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var interval: AdminBillingInterval = .monthly
    @State private var isApproving = false
    @State private var confirmingApprove = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: "@\(request.user.username)") } label: { Text(verbatim: "User") }
                    LabeledContent { Text(verbatim: request.requestedPlan.capitalized) } label: { Text(verbatim: "Requested plan") }
                    if let method = request.paymentMethod, !method.isEmpty {
                        LabeledContent { Text(verbatim: method) } label: { Text(verbatim: "Payment method") }
                    }
                    if let message = request.message, !message.isEmpty {
                        Text(verbatim: message)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                } header: {
                    Text(verbatim: "Request")
                }

                Section {
                    Picker(selection: $interval) {
                        ForEach(AdminBillingInterval.allCases) { interval in
                            Text(verbatim: interval.displayName).tag(interval)
                        }
                    } label: {
                        Text(verbatim: "Billing interval")
                    }
                } footer: {
                    Text(verbatim: "This legacy request never collects a billing interval - pick the one the user actually paid for.")
                }

                Section {
                    Button {
                        confirmingApprove = true
                    } label: {
                        Text(verbatim: isApproving ? "Approving\u{2026}" : "Approve and grant plan")
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(isApproving)
                } footer: {
                    Text(verbatim: "This grants or extends the user's \(request.requestedPlan.capitalized) plan, billed \(interval.displayName.lowercased()), in one step.")
                }
            }
            .navigationTitle(Text(verbatim: "Approve request"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: "Grant \(request.requestedPlan.capitalized) to @\(request.user.username)?"),
                isPresented: $confirmingApprove,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    guard !isApproving else { return }
                    isApproving = true
                    Task {
                        defer { isApproving = false }
                        if await onApprove(interval) { dismiss() }
                    }
                } label: {
                    Text(verbatim: "Approve and grant plan")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This grants or extends the user's \(request.requestedPlan.capitalized) plan, billed \(interval.displayName.lowercased()), in one transaction. It cannot be undone from this screen.")
            }
        }
    }
}
