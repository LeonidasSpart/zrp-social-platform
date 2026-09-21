import SwiftUI

/// Creator payout queue - the native answer to `/admin/withdrawals`.
///
/// **Approve triggers a real on-chain USDC transfer** from the
/// platform's own wallet, the same `sendUsdc()` path tips and premium
/// purchases pay out through. This is genuinely irreversible once
/// broadcast - the confirmation copy says so explicitly rather than a
/// generic "are you sure?".
struct AdminWithdrawalsView: View {

    let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var body: some View {
        AdminWithdrawalQueueView(
            title: "Creator withdrawals",
            approveWarning: "This sends real USDC on-chain to the wallet address below, from ZRP's platform wallet. Once broadcast, it cannot be recalled or reversed from this app.",
            fetch: { status in try await repository.creatorWithdrawals(status: status) },
            approve: { id in try await repository.approveCreatorWithdrawal(id: id) },
            reject: { id in try await repository.rejectCreatorWithdrawal(id: id) }
        )
    }
}
