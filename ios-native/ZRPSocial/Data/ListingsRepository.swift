import Foundation

/// ZRP Market Plus.
///
/// Every method maps to a route the website already uses, with the same
/// method, path, parameters and response shape. Nothing is invented.
///
/// Worth stating plainly, because it decides what this feature may do:
/// **the marketplace has no checkout.** There is no order, payment or
/// escrow route anywhere in the backend - a buyer contacts the seller
/// through ZRP's own messaging, and any transaction happens off-platform
/// between two people. The iOS app therefore takes no payment and links
/// to none, which is also what keeps it clear of App Store rule 3.1.1.
protocol ListingsRepositoryProtocol: Sendable {
    func browse(_ query: ListingQuery, cursor: String?) async throws -> ListingPage
    func listing(id: String) async throws -> Listing
    func toggleFavorite(id: String) async throws -> Bool
    func myListings() async throws -> [Listing]
    func favorites() async throws -> [Listing]
    func create(_ request: ListingWriteRequest) async throws -> Listing
    func update(id: String, _ request: ListingWriteRequest) async throws -> Listing
    func delete(id: String) async throws
}

/// The browse filters, matching `GET /api/listings`'s query parameters.
struct ListingQuery: Equatable {
    var category: ListingCategory?
    var search: String = ""
    var location: String = ""
    var minPrice: String = ""
    var maxPrice: String = ""
    var sort: ListingSort = .newest

    var isFiltered: Bool {
        category != nil
            || !search.isEmpty
            || !location.isEmpty
            || !minPrice.isEmpty
            || !maxPrice.isEmpty
            || sort != .newest
    }
}

enum ListingSort: String, CaseIterable, Identifiable, Equatable {
    case newest
    case priceLow
    case priceHigh

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .newest: return .marketplaceSortNewest
        case .priceLow: return .marketplaceSortPriceLow
        case .priceHigh: return .marketplaceSortPriceHigh
        }
    }
}

/// The body for creating and updating a listing.
///
/// `POST` and `PUT` accept the same fields, so one type serves both. The
/// route re-validates all of it - title length, description length, a
/// positive price unless `priceOnRequest`, at least one photo - and
/// enforces the seller's plan limits, which no client can see or bypass.
struct ListingWriteRequest: Encodable, Equatable {
    let category: String
    let title: String
    let description: String
    /// Omitted entirely when the listing is price-on-request, because the
    /// route reads `Number(price)` and only skips it in that case.
    let price: Double?
    let currency: String
    let priceOnRequest: Bool
    let location: String?
    let imageUrls: [String]
    let videoUrl: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(category, forKey: .category)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(price, forKey: .price)
        try container.encode(currency, forKey: .currency)
        try container.encode(priceOnRequest, forKey: .priceOnRequest)
        try container.encode(location, forKey: .location)
        try container.encode(imageUrls, forKey: .imageUrls)
        try container.encode(videoUrl, forKey: .videoUrl)
    }

    private enum CodingKeys: String, CodingKey {
        case category, title, description, price, currency, priceOnRequest
        case location, imageUrls, videoUrl
    }
}

struct ListingsRepository: ListingsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// Public browse: only `ACTIVE`, non-expired listings, cursor-paged.
    ///
    /// The route clamps `limit` to 100 itself; 20 is asked for because a
    /// listing card carries a photo, and a hundred of those is a lot of
    /// image loading for one screenful.
    func browse(_ query: ListingQuery, cursor: String?) async throws -> ListingPage {
        var parameters: [(String, String?)] = [
            ("limit", "20"),
            ("sort", query.sort.rawValue),
        ]
        if let cursor { parameters.append(("cursor", cursor)) }
        if let category = query.category { parameters.append(("category", category.rawValue)) }
        if !query.search.isEmpty { parameters.append(("search", query.search)) }
        if !query.location.isEmpty { parameters.append(("location", query.location)) }
        if !query.minPrice.isEmpty { parameters.append(("minPrice", query.minPrice)) }
        if !query.maxPrice.isEmpty { parameters.append(("maxPrice", query.maxPrice)) }

        return try await client.send(Endpoint.get("listings", query: parameters))
    }

    /// One listing. Returns the row itself rather than an envelope, with
    /// `favorited` merged in for a signed-in caller. A listing that is
    /// not `ACTIVE` answers 404 to anyone but its seller and staff, so a
    /// not-found here genuinely means "not available to you".
    func listing(id: String) async throws -> Listing {
        try await client.send(Endpoint.get("listings/\(id)"))
    }

    /// Toggles, and returns the state the server settled on.
    func toggleFavorite(id: String) async throws -> Bool {
        struct Response: Decodable { let favorited: Bool }
        let response: Response = try await client.send(Endpoint.post("listings/\(id)/favorite"))
        return response.favorited
    }

    /// The seller's own listings, in **every** status - the only route
    /// that returns non-active ones, and the only one carrying
    /// `rejectionReason`.
    func myListings() async throws -> [Listing] {
        let collection: ListingCollection = try await client.send(Endpoint.get("listings/mine"))
        return collection.listings
    }

    /// Favorited listings. The route drops any that are no longer
    /// `ACTIVE`, so a sold or removed item disappears rather than
    /// lingering as a saved listing that cannot be opened.
    func favorites() async throws -> [Listing] {
        let collection: ListingCollection = try await client.send(Endpoint.get("listings/favorites"))
        return collection.listings
    }

    /// Creates a listing. It is always created `PENDING_REVIEW` - the
    /// route sets that itself and ignores any status a client sends - so
    /// the UI says so rather than implying the listing is live.
    func create(_ request: ListingWriteRequest) async throws -> Listing {
        struct Response: Decodable { let listing: Listing }
        let response: Response = try await client.send(
            try Endpoint.post("listings", body: request)
        )
        return response.listing
    }

    /// Updates a listing the caller owns. Editing an `ACTIVE` listing
    /// returns it to `PENDING_REVIEW`, which the edit screen warns about
    /// before saving.
    func update(id: String, _ request: ListingWriteRequest) async throws -> Listing {
        struct Response: Decodable { let listing: Listing }
        let response: Response = try await client.send(
            try Endpoint.put("listings/\(id)", body: request)
        )
        return response.listing
    }

    func delete(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("listings/\(id)"))
    }
}
