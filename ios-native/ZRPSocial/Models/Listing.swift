import Foundation

/// ZRP Market Plus categories.
///
/// A fixed server-side enum (`CATEGORIES` in `src/app/api/listings/route.ts`)
/// with no endpoint to fetch it, so the website hardcodes the same seven
/// values. The raw values here are those exact strings - a mismatch would
/// be silently dropped by the route's own validation.
enum ListingCategory: String, CaseIterable, Identifiable, Codable {
    case luxuryCars = "LUXURY_CARS"
    case yachtsBoats = "YACHTS_BOATS"
    case privateAircraft = "PRIVATE_AIRCRAFT"
    case luxuryHotelsResorts = "LUXURY_HOTELS_RESORTS"
    case luxuryRealEstate = "LUXURY_REAL_ESTATE"
    case watchesJewelry = "WATCHES_JEWELRY"
    case otherLuxury = "OTHER_LUXURY"

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .luxuryCars: return .marketplaceCategoryLuxuryCars
        case .yachtsBoats: return .marketplaceCategoryYachtsBoats
        case .privateAircraft: return .marketplaceCategoryPrivateAircraft
        case .luxuryHotelsResorts: return .marketplaceCategoryLuxuryHotelsResorts
        case .luxuryRealEstate: return .marketplaceCategoryLuxuryRealEstate
        case .watchesJewelry: return .marketplaceCategoryWatchesJewelry
        case .otherLuxury: return .marketplaceCategoryOtherLuxury
        }
    }

    var systemImage: String {
        switch self {
        case .luxuryCars: return "car.fill"
        case .yachtsBoats: return "sailboat.fill"
        case .privateAircraft: return "airplane"
        case .luxuryHotelsResorts: return "building.2.fill"
        case .luxuryRealEstate: return "house.fill"
        case .watchesJewelry: return "sparkles"
        case .otherLuxury: return "shippingbox.fill"
        }
    }
}

/// A listing's moderation state.
///
/// Every listing starts `PENDING_REVIEW` - the route sets it, a client
/// cannot - and editing a live one sends it back for review. Only the
/// seller and staff ever see a non-`ACTIVE` listing, so these appear on
/// the My Listings screen and nowhere else.
enum ListingStatus: String, Decodable {
    case draft = "DRAFT"
    case pendingReview = "PENDING_REVIEW"
    case active = "ACTIVE"
    case rejected = "REJECTED"
    case sold = "SOLD"
    case expired = "EXPIRED"
    case removed = "REMOVED"

    var titleKey: L10nKey {
        switch self {
        case .draft: return .marketplaceStatusDraft
        case .pendingReview: return .marketplaceStatusPendingReview
        case .active: return .marketplaceStatusActive
        case .rejected: return .marketplaceStatusRejected
        case .sold: return .marketplaceStatusSold
        case .expired: return .marketplaceStatusExpired
        case .removed: return .marketplaceStatusRemoved
        }
    }
}

struct ListingSeller: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?

    var displayName: String { name?.isEmpty == false ? name! : username }

    /// The website shows a "Verified Seller" mark for any badged account.
    var isVerified: Bool { (badgeType?.isEmpty == false) }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try container.decodeIfPresent(String.self, forKey: .username) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        badgeType = try container.decodeIfPresent(String.self, forKey: .badgeType)
    }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, avatarUrl, badgeType
    }
}

/// One marketplace listing.
///
/// The listings routes return different projections of the same Prisma
/// model - browse omits `description` and `status`, `mine` omits the
/// seller and adds `rejectionReason`, detail returns everything plus
/// `favorited` - so the fields that only some projections carry are
/// optional here rather than modelled as three near-identical types.
///
/// `price` is a **number**, not a string: money is stored as a Prisma
/// `Decimal`, and `jsonWithDecimals` converts every Decimal to a plain
/// number before serialising (`src/lib/serialize-decimal.ts`).
struct Listing: Decodable, Identifiable, Equatable {
    let id: String
    let category: ListingCategory?
    let title: String
    let description: String?
    let price: Double?
    let currency: String
    let priceOnRequest: Bool
    let location: String?
    let imageUrls: [String]
    let videoUrl: String?
    let views: Int
    let status: ListingStatus?
    let rejectionReason: String?
    let expiresAt: Date?
    let createdAt: Date?
    let seller: ListingSeller?
    let favoriteCount: Int

    /// Only the detail route reports this.
    let favorited: Bool?

    var coverImageUrl: String? { imageUrls.first }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        // An unrecognised category must not fail the whole page - a new
        // one added server-side should render as uncategorised rather
        // than breaking the browse list.
        category = ListingCategory(
            rawValue: try container.decodeIfPresent(String.self, forKey: .category) ?? ""
        )
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        price = try container.decodeIfPresent(Double.self, forKey: .price)
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "USD"
        priceOnRequest = try container.decodeIfPresent(Bool.self, forKey: .priceOnRequest) ?? false
        location = try container.decodeIfPresent(String.self, forKey: .location)
        imageUrls = try container.decodeIfPresent([String].self, forKey: .imageUrls) ?? []
        videoUrl = try container.decodeIfPresent(String.self, forKey: .videoUrl)
        views = try container.decodeIfPresent(Int.self, forKey: .views) ?? 0
        status = ListingStatus(
            rawValue: try container.decodeIfPresent(String.self, forKey: .status) ?? ""
        )
        rejectionReason = try container.decodeIfPresent(String.self, forKey: .rejectionReason)
        expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        seller = try container.decodeIfPresent(ListingSeller.self, forKey: .seller)
        let counts = try container.decodeIfPresent(Counts.self, forKey: .counts)
        favoriteCount = counts?.favorites ?? 0
        favorited = try container.decodeIfPresent(Bool.self, forKey: .favorited)
    }

    private struct Counts: Decodable {
        let favorites: Int?
    }

    private enum CodingKeys: String, CodingKey {
        case id, category, title, description, price, currency, priceOnRequest
        case location, imageUrls, videoUrl, views, status, rejectionReason
        case expiresAt, createdAt, seller, favorited
        case counts = "_count"
    }

    /// The price as shown: a formatted amount, or the "Price on Request"
    /// wording the seller chose. Never a bare "0".
    var priceLabel: String {
        if priceOnRequest || price == nil {
            return L10n.string(.marketplacePriceOnRequest)
        }
        return ListingPriceFormat.string(price ?? 0, currency: currency)
    }
}

/// `GET /api/listings` - the only listings route that pages.
struct ListingPage: Decodable {
    let listings: [Listing]
    let nextCursor: String?
}

/// `GET /api/listings/mine` and `/favorites` - a bare envelope, no cursor.
struct ListingCollection: Decodable {
    let listings: [Listing]
}

enum ListingPriceFormat {
    /// Formats in the listing's own currency, in the viewer's locale.
    ///
    /// No fraction digits: these are luxury asset prices, where
    /// "$1,250,000" is the useful form and the cents are noise.
    static func string(_ amount: Double, currency: String) -> String {
        var format = FloatingPointFormatStyle<Double>.Currency(code: currency)
        format = format.precision(.fractionLength(0))
        return amount.formatted(format)
    }
}
