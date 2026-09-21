import SwiftUI

/// HELP campaign payout queue - the native answer to
/// `/admin/help-withdrawals`. Same real on-chain transfer as creator
/// withdrawals, out of the campaign's own reserved balance.
struct AdminHelpWithdrawalsView: View {

    let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var body: some View {
        AdminWithdrawalQueueView(
            title: "HELP withdrawals",
            approveWarning: "This sends real USDC on-chain to the wallet address below, from ZRP's platform wallet. Once broadcast, it cannot be recalled or reversed from this app.",
            fetch: { status in try await repository.helpWithdrawals(status: status) },
            approve: { id in try await repository.approveHelpWithdrawal(id: id) },
            reject: { id in try await repository.rejectHelpWithdrawal(id: id) }
        )
    }
}
