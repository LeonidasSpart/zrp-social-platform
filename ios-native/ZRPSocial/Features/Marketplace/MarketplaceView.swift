import SwiftUI

/// ZRP Market Plus browse.
///
/// `GET /api/listings` returns only `ACTIVE`, non-expired listings and is
/// the one listings route that pages, so this is the only marketplace
/// screen with infinite scroll. Everything shown here is a real listing
/// that a moderator has approved.
@MainActor
final class MarketplaceViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var listings: [Listing] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false
    @Published var query = ListingQuery()

    private var nextCursor: String?
    private var searchTask: Task<Void, Never>?
    private let repository: ListingsRepositoryProtocol

    init(repository: ListingsRepositoryProtocol = ListingsRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await reload()
    }

    func reload() async {
        if listings.isEmpty { phase = .loading }
        do {
            let page = try await repository.browse(query, cursor: nil)
            listings = page.listings
            nextCursor = page.nextCursor
            phase = .loaded
        } catch is CancellationError {
            return
        } catch ApiError.cancelled {
            return
        } catch {
            if listings.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Appends the next page. Guarded so a fast scroll cannot fire several
    /// overlapping requests for the same cursor.
    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await repository.browse(query, cursor: cursor)
            // The route pages by listing id; appending only ids not
            // already held keeps a listing from appearing twice if one
            // was inserted between page fetches.
            let known = Set(listings.map(\.id))
            listings.append(contentsOf: page.listings.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            // A failed page is not a failed screen: what already loaded
            // stays, and scrolling again retries the same cursor.
            nextCursor = cursor
        }
    }

    /// Debounced, and cancels a superseded request, so an earlier search
    /// cannot land after the one actually being waited on.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.reload()
        }
    }

    func applyFilters(_ newQuery: ListingQuery) {
        query = newQuery
        Task { await reload() }
    }
}

struct MarketplaceView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MarketplaceViewModel()
    @State private var isFiltering = false

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.marketplaceHeroTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .searchable(
                text: $viewModel.query.search,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: Text(.marketplaceSearchPlaceholder)
            )
            .onChange(of: viewModel.query.search) { _, _ in viewModel.searchChanged() }
            .sheet(isPresented: $isFiltering) {
                NavigationStack {
                    ListingFiltersView(query: viewModel.query) { updated in
                        viewModel.applyFilters(updated)
                    }
                }
            }
            .task { await viewModel.loadIfNeeded() }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { navigator.push(.listingCompose(listingId: nil)) } label: {
                    Label { Text(.marketplaceCreateListing) } icon: { Image(systemName: "plus") }
                }
                Button { navigator.push(.myListings) } label: {
                    Label { Text(.marketplaceMyListings) } icon: { Image(systemName: "tag") }
                }
                Button { navigator.push(.listingFavorites) } label: {
                    Label { Text(.marketplaceFavorites) } icon: { Image(systemName: "heart") }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel(Text(.marketplaceMyListings))
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { isFiltering = true } label: {
                Image(systemName: viewModel.query.isFiltered
                      ? "line.3.horizontal.decrease.circle.fill"
                      : "line.3.horizontal.decrease.circle")
            }
            .accessibilityLabel(Text(.marketplaceFilters))
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.listings.isEmpty {
                TimelineStateView.empty(
                    systemImage: "bag",
                    title: .marketplaceHeroTitle,
                    subtitle: viewModel.query.isFiltered
                        ? .marketplaceNoListingsFound
                        : .marketplaceNoListingsYet
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: ZrpSpacing.lg) {
                categoryRow

                ForEach(viewModel.listings) { listing in
                    Button {
                        navigator.push(.listingDetail(id: listing.id))
                    } label: {
                        ListingCardView(listing: listing)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        if listing.id == viewModel.listings.last?.id {
                            Task { await viewModel.loadMore() }
                        }
                    }
                }

                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.red).padding(.vertical, ZrpSpacing.md)
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.reload() }
    }

    private var categoryRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                categoryChip(nil, label: L10n.string(.marketplaceAllCategories), systemImage: "square.grid.2x2")
                ForEach(ListingCategory.allCases) { category in
                    categoryChip(
                        category,
                        label: L10n.string(category.titleKey),
                        systemImage: category.systemImage
                    )
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
        }
    }

    private func categoryChip(_ category: ListingCategory?, label: String, systemImage: String) -> some View {
        let isSelected = viewModel.query.category == category
        return Button {
            var updated = viewModel.query
            updated.category = category
            viewModel.applyFilters(updated)
        } label: {
            Label { Text(verbatim: label) } icon: { Image(systemName: systemImage) }
                .font(.footnote.weight(.medium))
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceHighest)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// One listing in a list: cover photo, price, title, location.
struct ListingCardView: View {

    let listing: Listing
    var showsStatus: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            ZStack(alignment: .topTrailing) {
                ListingImageView(url: listing.coverImageUrl, height: 200)

                if showsStatus, let status = listing.status {
                    Text(status.titleKey)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, ZrpSpacing.sm)
                        .padding(.vertical, 4)
                        .background(.black.opacity(0.65))
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                        .padding(ZrpSpacing.sm)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: listing.priceLabel)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)

                Text(verbatim: listing.title)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: ZrpSpacing.xs) {
                    if let category = listing.category {
                        Text(category.titleKey)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    if let location = listing.location, !location.isEmpty {
                        // A pin rather than a separator glyph: it says
                        // what the text is, and needs no punctuation
                        // that would have to be localized.
                        Label { Text(verbatim: location) } icon: {
                            Image(systemName: "mappin.and.ellipse")
                        }
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A listing photo, or a neutral placeholder when there is none.
struct ListingImageView: View {

    let url: String?
    let height: CGFloat

    var body: some View {
        Group {
            if let url, let parsed = URL(string: url), !url.isEmpty {
                AsyncImage(url: parsed) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
        .background(ZrpColor.surfaceHighest)
    }

    private var placeholder: some View {
        ZrpColor.surfaceHighest.overlay(
            Image(systemName: "photo")
                .font(.title2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        )
    }
}

/// The filter sheet: category, location, price range and sort - exactly
/// the parameters `GET /api/listings` accepts, and no others.
struct ListingFiltersView: View {

    @Environment(\.dismiss) private var dismiss
    @State private var draft: ListingQuery
    private let onApply: (ListingQuery) -> Void

    init(query: ListingQuery, onApply: @escaping (ListingQuery) -> Void) {
        _draft = State(initialValue: query)
        self.onApply = onApply
    }

    var body: some View {
        Form {
            Section {
                Picker(selection: $draft.category) {
                    Text(.marketplaceAllCategories).tag(ListingCategory?.none)
                    ForEach(ListingCategory.allCases) { category in
                        Text(category.titleKey).tag(ListingCategory?.some(category))
                    }
                } label: {
                    Text(.marketplaceCategory)
                }

                Picker(selection: $draft.sort) {
                    ForEach(ListingSort.allCases) { sort in
                        Text(sort.titleKey).tag(sort)
                    }
                } label: {
                    Text(.marketplaceFilters)
                }
            }

            Section {
                TextField(
                    text: $draft.location,
                    prompt: Text(.marketplaceLocationPlaceholder),
                    label: { Text(.marketplaceLocationPlaceholder) }
                )
                TextField(
                    text: $draft.minPrice,
                    prompt: Text(.marketplaceMinPrice),
                    label: { Text(.marketplaceMinPrice) }
                )
                .keyboardType(.numberPad)
                TextField(
                    text: $draft.maxPrice,
                    prompt: Text(.marketplaceMaxPrice),
                    label: { Text(.marketplaceMaxPrice) }
                )
                .keyboardType(.numberPad)
            }
        }
        .navigationTitle(Text(.marketplaceFilters))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    onApply(draft)
                    dismiss()
                } label: {
                    Text(.marketplaceApplyFilters)
                }
            }
        }
    }
}
