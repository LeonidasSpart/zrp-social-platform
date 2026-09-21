import SwiftUI

/// ZRP HELP campaign review queue - the native answer to `/admin/help`.
struct AdminHelpCampaignsView: View {

    let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var body: some View {
        AdminReviewQueueView(
            title: "HELP campaigns",
            emptySystemImage: "heart",
            fetch: { status, page in try await repository.helpCampaigns(status: status, page: page) },
            act: { id, action, reason in try await repository.reviewHelpCampaign(id: id, action: action, rejectionReason: reason) }
        )
    }
}
