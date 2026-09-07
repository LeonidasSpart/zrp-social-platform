import SwiftUI

/// The seller's own listings, in every status.
///
/// `GET /api/listings/mine` is the only listings route that returns
/// non-`ACTIVE` rows, and the only one carrying `rejectionReason` - which
/// is why this screen exists separately from browse rather than being a
/// filter on it. A rejected listing shows the moderator's reason, because
/// that is the only place the seller can learn why.
struct MyListingsView: View {

    @EnvironmentObject private var navigator: Navigator
    @State private var listings: [Listing]?
    @State private var loadError: ApiError?

    private let repository = ListingsRepository()

    var body: some View {
        Group {
            if let loadError, listings == nil {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else if let listings {
                if listings.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "tag",
                        title: .marketplaceMyListings,
                        subtitle: .marketplaceNoOwnListings
                    )
                } else {
                    list(listings)
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.marketplaceMyListings))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { navigator.push(.listingCompose(listingId: nil)) } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text(.marketplaceCreateListing))
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            listings = try await repository.myListings()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func list(_ listings: [Listing]) -> some View {
        ScrollView {
            LazyVStack(spacing: ZrpSpacing.lg) {
                ForEach(listings) { listing in
                    VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                        Button {
                            navigator.push(.listingDetail(id: listing.id))
                        } label: {
                            ListingCardView(listing: listing, showsStatus: true)
                        }
                        .buttonStyle(.plain)

                        if listing.status == .rejected, let reason = listing.rejectionReason, !reason.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(.marketplaceRejectionReasonLabel)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(ZrpColor.red)
                                Text(verbatim: reason)
                                    .font(.caption)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, ZrpSpacing.lg)
                        }
                    }
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }
}

/// Favorited listings.
///
/// The route drops anything no longer `ACTIVE`, so a sold or removed
/// item disappears here rather than lingering as a saved listing that
/// cannot be opened.
struct ListingFavoritesView: View {

    @EnvironmentObject private var navigator: Navigator
    @State private var listings: [Listing]?
    @State private var loadError: ApiError?

    private let repository = ListingsRepository()

    var body: some View {
        Group {
            if let loadError, listings == nil {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else if let listings {
                if listings.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "heart",
                        title: .marketplaceFavorites,
                        subtitle: .marketplaceNoFavoritesYet
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: ZrpSpacing.lg) {
                            ForEach(listings) { listing in
                                Button {
                                    navigator.push(.listingDetail(id: listing.id))
                                } label: {
                                    ListingCardView(listing: listing)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, ZrpSpacing.lg)
                        .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                        .frame(maxWidth: .infinity)
                    }
                    .refreshable { await load() }
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.marketplaceFavorites))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            listings = try await repository.favorites()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }
}
