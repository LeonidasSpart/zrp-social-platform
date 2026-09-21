import SwiftUI

@MainActor
final class AdminSubscriptionDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var detail: AdminSubscriptionDetail?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let userId: String
    private let repository: AdminRepositoryProtocol

    init(userId: String, repository: AdminRepositoryProtocol = AdminRepository()) {
        self.userId = userId
        self.repository = repository
    }

    func load() async {
        if detail == nil { phase = .loading }
        do {
            detail = try await repository.subscription(userId: userId)
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    @discardableResult
    private func mutate(_ work: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await work()
            await load()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }

    @discardableResult
    func grant(plan: AdminGrantablePlan, billingInterval: AdminBillingInterval) async -> Bool {
        await mutate { [repository, userId] in try await repository.grantSubscription(userId: userId, plan: plan, billingInterval: billingInterval) }
    }

    @discardableResult
    func cancel(reason: String?) async -> Bool {
        await mutate { [repository, userId] in try await repository.cancelSubscription(userId: userId, reason: reason) }
    }

    @discardableResult
    func restore() async -> Bool {
        await mutate { [repository, userId] in try await repository.restoreSubscription(userId: userId) }
    }
}

/// One user's billing detail - the native answer to
/// `/admin/subscriptions/{userId}`. Admin-only.
struct AdminSubscriptionDetailView: View {

    let userId: String
    @StateObject private var viewModel: AdminSubscriptionDetailViewModel
    @State private var isGranting = false
    @State private var confirmingCancel = false
    @State private var confirmingRestore = false
    @State private var cancelReason = ""

    init(userId: String) {
        self.userId = userId
        _viewModel = StateObject(wrappedValue: AdminSubscriptionDetailViewModel(userId: userId))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Billing"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .sheet(isPresented: $isGranting) {
                AdminGrantSubscriptionSheet { plan, interval in await viewModel.grant(plan: plan, billingInterval: interval) }
            }
            .confirmationDialog(
                Text(verbatim: "Cancel this subscription?"),
                isPresented: $confirmingCancel,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task { await viewModel.cancel(reason: cancelReason) }
                } label: {
                    Text(verbatim: "Cancel subscription")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This ends the user's paid access immediately, even though time remains on the current period.")
            }
            .confirmationDialog(
                Text(verbatim: "Restore this subscription?"),
                isPresented: $confirmingRestore,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task { await viewModel.restore() }
                } label: {
                    Text(verbatim: "Restore")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This reinstates paid access for the time remaining on the period that was canceled.")
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })
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
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .loaded:
            if let detail = viewModel.detail {
                Form {
                    Section {
                        LabeledContent { Text(verbatim: detail.user.name?.isEmpty == false ? detail.user.name! : detail.user.username) } label: { Text(verbatim: "Name") }
                        LabeledContent { Text(verbatim: "@\(detail.user.username)") } label: { Text(verbatim: "Username") }
                        if let email = detail.user.email {
                            LabeledContent { Text(verbatim: email) } label: { Text(verbatim: "Email") }
                        }
                        LabeledContent { Text(verbatim: detail.user.plan.capitalized) } label: { Text(verbatim: "Current plan") }
                    } header: {
                        Text(verbatim: "Account")
                    }

                    if let sub = detail.subscription {
                        Section {
                            LabeledContent { AdminStatusChip(status: sub.status) } label: { Text(verbatim: "Status") }
                            LabeledContent { Text(verbatim: sub.plan.capitalized) } label: { Text(verbatim: "Plan") }
                            if let interval = sub.billingInterval {
                                LabeledContent { Text(verbatim: interval.capitalized) } label: { Text(verbatim: "Billing interval") }
                            }
                            if let end = sub.currentPeriodEnd {
                                LabeledContent { Text(verbatim: RelativeTime.compact(from: end)) } label: { Text(verbatim: "Period ends") }
                            }
                            if let days = sub.daysRemaining {
                                LabeledContent { Text(verbatim: CountFormatting.exact(days)) } label: { Text(verbatim: "Days remaining") }
                            }
                            if sub.isLegacyBackfill {
                                Text(verbatim: "Backfilled from a legacy entitlement, not a real payment.")
                                    .font(.caption)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                            }
                        } header: {
                            Text(verbatim: "Subscription")
                        }

                        if !sub.payments.isEmpty {
                            Section {
                                ForEach(sub.payments) { payment in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(verbatim: "\(payment.plan.capitalized) \u{00B7} \(CountFormatting.exact(Int(payment.amount)))")
                                            .font(.subheadline)
                                        Text(verbatim: "\(payment.paymentMethod) \u{00B7} \(RelativeTime.compact(from: payment.createdAt))")
                                            .font(.caption)
                                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                                    }
                                }
                            } header: {
                                Text(verbatim: "Payment history")
                            }
                        }
                    } else {
                        Section {
                            Text(verbatim: detail.user.plan == "free" ? "No subscription on file." : "Paid per the account's plan field, but with no Subscription record yet - needs reconciliation.")
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }

                    Section {
                        Button {
                            isGranting = true
                        } label: {
                            Text(verbatim: "Grant / extend subscription")
                        }
                        .disabled(viewModel.isWorking)

                        if let sub = detail.subscription, sub.status == "ACTIVE" {
                            Button(role: .destructive) {
                                confirmingCancel = true
                            } label: {
                                Text(verbatim: "Cancel subscription")
                            }
                            .disabled(viewModel.isWorking)
                        }

                        if let sub = detail.subscription, sub.status == "CANCELED" {
                            Button {
                                confirmingRestore = true
                            } label: {
                                Text(verbatim: "Restore subscription")
                            }
                            .disabled(viewModel.isWorking)
                        }
                    } header: {
                        Text(verbatim: "Actions")
                    }
                }
                .scrollContentBackground(.hidden)
                .refreshable { await viewModel.load() }
            }
        }
    }
}

struct AdminGrantSubscriptionSheet: View {

    let onGrant: (AdminGrantablePlan, AdminBillingInterval) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var plan: AdminGrantablePlan = .pro
    @State private var interval: AdminBillingInterval = .monthly
    @State private var isGranting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(selection: $plan) {
                        ForEach(AdminGrantablePlan.allCases) { plan in
                            Text(verbatim: plan.displayName).tag(plan)
                        }
                    } label: {
                        Text(verbatim: "Plan")
                    }
                    Picker(selection: $interval) {
                        ForEach(AdminBillingInterval.allCases) { interval in
                            Text(verbatim: interval.displayName).tag(interval)
                        }
                    } label: {
                        Text(verbatim: "Billing interval")
                    }
                } footer: {
                    Text(verbatim: "Extends from the existing period end if one is active, the same rule a real payment follows. Use this for goodwill credit, an offline payment, or a support resolution.")
                }
            }
            .navigationTitle(Text(verbatim: "Grant subscription"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        guard !isGranting else { return }
                        isGranting = true
                        Task {
                            defer { isGranting = false }
                            if await onGrant(plan, interval) { dismiss() }
                        }
                    } label: {
                        Text(verbatim: isGranting ? "Granting\u{2026}" : "Grant")
                    }
                    .disabled(isGranting)
                }
            }
        }
    }
}
