import SwiftUI

@MainActor
final class AdminPaymentsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var payments: [AdminPaymentRequest] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

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
        if payments.isEmpty { phase = .loading }
        do {
            payments = try await repository.pendingPayments()
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if payments.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func verify(_ payment: AdminPaymentRequest) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.verifyPayment(id: payment.id)
            await reload()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            // The claim may have already gone through (a 409 from a
            // double-tap or another admin/tab) - reload so the row
            // reflects reality either way instead of staying stale.
            await reload()
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }
}

/// Admin-only manual crypto payment verification queue - the native
/// answer to `/admin/payments`. Always a short, pending-only list: the
/// server pre-filters to `status: "pending"` and never paginates, so
/// this screen has no filter or page controls to match.
///
/// **Verifying grants or extends the user's plan** in the same
/// transaction as the server-side claim - a real, plan-granting
/// financial action, so the confirmation copy says exactly that rather
/// than a generic "are you sure?".
struct AdminPaymentsView: View {

    @StateObject private var viewModel: AdminPaymentsViewModel
    @State private var confirmingPayment: AdminPaymentRequest?

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        _viewModel = StateObject(wrappedValue: AdminPaymentsViewModel(repository: repository))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Payments"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: "Verify this payment?"),
                isPresented: Binding(get: { confirmingPayment != nil }, set: { if !$0 { confirmingPayment = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let payment = confirmingPayment {
                        confirmingPayment = nil
                        Task { await viewModel.verify(payment) }
                    }
                } label: {
                    Text(verbatim: "Verify and grant plan")
                }
                Button(role: .cancel) { confirmingPayment = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This verifies the payment and grants or extends the user's plan in one step. It cannot be undone from this screen.")
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
            if viewModel.payments.isEmpty {
                AdminEmptyState(
                    systemImage: "creditcard",
                    title: "No pending payments",
                    subtitle: "New manual crypto payment claims will appear here."
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.payments) { payment in
                    row(payment)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ payment: AdminPaymentRequest) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: "\(payment.currency) \(CountFormatting.exact(Int(payment.amount)))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                Text(verbatim: payment.plan.capitalized)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZrpColor.amber)
                    .padding(.horizontal, ZrpSpacing.sm)
                    .padding(.vertical, 2)
                    .background(ZrpColor.amber.opacity(0.12), in: Capsule())
            }
            Text(verbatim: "@\(payment.user.username)")
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            if let name = payment.user.name, !name.isEmpty {
                Text(verbatim: name)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let email = payment.user.email {
                Text(verbatim: email)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let interval = payment.billingInterval, !interval.isEmpty {
                Text(verbatim: "Billing: \(interval.capitalized)")
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let txId = payment.transactionId, !txId.isEmpty {
                Text(verbatim: "Tx: \(txId)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Text(verbatim: RelativeTime.compact(from: payment.createdAt))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Button {
                confirmingPayment = payment
            } label: {
                Text(verbatim: "Verify")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.md)
                    .padding(.vertical, ZrpSpacing.xs)
                    .background(ZrpColor.green, in: Capsule())
                    .foregroundStyle(.white)
            }
            .disabled(viewModel.isWorking)
            .padding(.top, 2)
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
