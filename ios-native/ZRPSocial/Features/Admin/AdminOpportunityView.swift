import SwiftUI

/// ZRP Opportunity review queue - the native answer to `/admin/opportunity`.
struct AdminOpportunityView: View {

    let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var body: some View {
        AdminReviewQueueView(
            title: "Opportunity",
            emptySystemImage: "briefcase",
            fetch: { status, page in try await repository.opportunityListings(status: status, page: page) },
            act: { id, action, reason in try await repository.reviewOpportunityListing(id: id, action: action, rejectionReason: reason) }
        )
    }
}
