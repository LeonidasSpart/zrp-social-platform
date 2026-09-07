import SwiftUI

/// One listing.
///
/// `GET /api/listings/{id}` answers 404 for anything not `ACTIVE` unless
/// the caller is its seller or staff, so a not-found here genuinely means
/// "not available to you" and is shown as such rather than as an error.
struct ListingDetailView: View {

    let listingId: String

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator

    @State private var listing: Listing?
    @State private var loadError: ApiError?
    @State private var isFavorited = false
    @State private var favoriteCount = 0
    @State private var imageIndex = 0
    @State private var isDeleting = false
    @State private var confirmDelete = false
    @State private var actionError: String?

    private let repository = ListingsRepository()

    private var isOwner: Bool {
        guard let sellerId = listing?.seller?.id, let viewerId = session.currentUser?.id else {
            return false
        }
        return sellerId == viewerId
    }

    var body: some View {
        Group {
            if let listing {
                detail(listing)
            } else if let loadError {
                if loadError.isNotFound {
                    TimelineStateView.empty(
                        systemImage: "bag",
                        title: .marketplaceListingNotFound,
                        subtitle: nil
                    )
                } else {
                    TimelineStateView.error(loadError) { Task { await load() } }
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.marketplaceHeroTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert(
            Text(.marketplaceConfirmDelete),
            isPresented: $confirmDelete
        ) {
            Button(role: .destructive) { delete() } label: { Text(.marketplaceDelete) }
            Button(role: .cancel) { } label: { Text(.musicStudioCancel) }
        }
    }

    private func load() async {
        do {
            let fetched = try await repository.listing(id: listingId)
            listing = fetched
            isFavorited = fetched.favorited ?? false
            favoriteCount = fetched.favoriteCount
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    @ViewBuilder
    private func detail(_ listing: Listing) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                gallery(listing)

                VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                    Text(verbatim: listing.priceLabel)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)

                    Text(verbatim: listing.title)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)

                    metadata(listing)
                }
                .padding(.horizontal, ZrpSpacing.lg)

                if let description = listing.description, !description.isEmpty {
                    Text(verbatim: description)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, ZrpSpacing.lg)
                }

                if let seller = listing.seller {
                    sellerRow(seller, listing: listing)
                }

                if let actionError {
                    Text(verbatim: actionError)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .padding(.horizontal, ZrpSpacing.lg)
                }

                // Shown on every listing, not just suspicious ones: it is
                // the marketplace's standing advice, and the one place a
                // buyer is most likely to act on it.
                Text(.marketplaceSafetyTip)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, ZrpSpacing.lg)

                if isOwner {
                    ownerActions(listing)
                }
            }
            .padding(.bottom, ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func gallery(_ listing: Listing) -> some View {
        VStack(spacing: ZrpSpacing.sm) {
            if listing.imageUrls.isEmpty {
                ListingImageView(url: nil, height: 280)
            } else {
                TabView(selection: $imageIndex) {
                    ForEach(Array(listing.imageUrls.enumerated()), id: \.offset) { index, url in
                        ListingImageView(url: url, height: 280).tag(index)
                    }
                }
                .frame(height: 280)
                .tabViewStyle(.page(indexDisplayMode: .automatic))
                .accessibilityLabel(Text(.marketplacePhotos))
            }
        }
    }

    private func metadata(_ listing: Listing) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            if let category = listing.category {
                Label { Text(category.titleKey) } icon: { Image(systemName: category.systemImage) }
            }
            if let location = listing.location, !location.isEmpty {
                Label { Text(verbatim: location) } icon: { Image(systemName: "mappin.and.ellipse") }
            }
            Label {
                Text(.marketplaceViewsCount, ["n": CountFormatting.exact(listing.views)])
            } icon: {
                Image(systemName: "eye")
            }
        }
        .font(.caption)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
    }

    private func sellerRow(_ seller: ListingSeller, listing: Listing) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Button {
                navigator.push(.profile(username: seller.username))
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    AvatarView(
                        url: seller.avatarUrl,
                        displayName: seller.displayName,
                        size: ZrpMetrics.avatarMedium
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: seller.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        if seller.isVerified {
                            Text(.marketplaceVerifiedSeller)
                                .font(.caption)
                                .foregroundStyle(ZrpColor.blue)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !isOwner {
                HStack(spacing: ZrpSpacing.sm) {
                    Button { contactSeller(seller, listing: listing) } label: {
                        Label { Text(.marketplaceContactSeller) } icon: { Image(systemName: "bubble.left") }
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(ZrpColor.red)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                    }
                    .buttonStyle(.plain)

                    Button { toggleFavorite() } label: {
                        Label {
                            Text(isFavorited ? L10nKey.marketplaceFavorited : L10nKey.marketplaceFavorite)
                        } icon: {
                            Image(systemName: isFavorited ? "heart.fill" : "heart")
                        }
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(isFavorited ? ZrpColor.red : ZrpColor.onSurface)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
    }

    private func ownerActions(_ listing: Listing) -> some View {
        HStack(spacing: ZrpSpacing.sm) {
            // The route refuses to edit a SOLD or REMOVED listing, so the
            // control is not offered for one rather than failing on tap.
            if listing.status != .sold && listing.status != .removed {
                Button {
                    navigator.push(.listingCompose(listingId: listing.id))
                } label: {
                    Text(.marketplaceEdit)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(ZrpColor.onSurface)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
            }

            Button { confirmDelete = true } label: {
                Text(.marketplaceDelete)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceHighest)
                    .foregroundStyle(ZrpColor.red)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(.horizontal, ZrpSpacing.lg)
    }

    // MARK: - Actions

    /// Opens the existing ZRP conversation with the seller, pre-filled
    /// with the same opening line and listing link the website composes.
    /// Nothing is sent automatically - the person edits and sends it.
    private func contactSeller(_ seller: ListingSeller, listing: Listing) {
        let partner = PostAuthor(
            id: seller.id,
            username: seller.username,
            name: seller.name,
            avatarUrl: seller.avatarUrl,
            badgeType: seller.badgeType,
            plan: nil
        )
        let draft = L10n.string(.marketplaceContactSellerPrefill)
            + " https://zrp.one/marketplace/listing/\(listing.id)"
        navigator.push(.listingConversation(partner: partner, draft: draft))
    }

    private func toggleFavorite() {
        let previous = isFavorited
        isFavorited.toggle()
        favoriteCount += isFavorited ? 1 : -1
        Task {
            do {
                let settled = try await repository.toggleFavorite(id: listingId)
                isFavorited = settled
            } catch {
                isFavorited = previous
                favoriteCount += previous ? 1 : -1
            }
        }
    }

    private func delete() {
        Task {
            isDeleting = true
            defer { isDeleting = false }
            do {
                try await repository.delete(id: listingId)
                navigator.pop()
            } catch {
                actionError = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.marketplaceErrDeleteFailed)
            }
        }
    }
}
