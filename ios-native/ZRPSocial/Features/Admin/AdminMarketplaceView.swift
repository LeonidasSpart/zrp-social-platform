import SwiftUI

/// ZRP Market Plus review queue - the native answer to `/admin/marketplace`.
struct AdminMarketplaceView: View {

    let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var body: some View {
        AdminReviewQueueView(
            title: "Marketplace",
            emptySystemImage: "bag",
            fetch: { status, page in try await repository.marketplaceListings(status: status, page: page) },
            act: { id, action, reason in try await repository.reviewMarketplaceListing(id: id, action: action, rejectionReason: reason) }
        )
    }
}
