import Foundation

/// One sponsored post, from `GET /api/ads/serve`.
///
/// The route answers `{ad: null}` far more often than not - when no
/// campaign is active, when every active campaign has spent its budget,
/// or when the only eligible campaign is the viewer's own (it will not
/// show someone their own ad and waste their budget). A null ad is the
/// normal case, not a failure.
///
/// **This is a viewing surface only.** Creating or funding a campaign is
/// ad spend and stays out of the app under the same store policy that
/// excludes every other payment route; see PARITY.md. Nothing here
/// takes money - it shows what an advertiser already bought and tells
/// the server it was seen.
struct SponsoredAd: Decodable, Equatable, Identifiable {
    let campaignId: String

    /// Where a click should go. Optional: an advertiser who set no
    /// external destination gets the post itself, and the click route
    /// says which by returning the URL to follow.
    let targetUrl: String?
    let post: SponsoredPost

    /// The campaign, not the post - the same campaign can be served
    /// again with the same post, and it is the campaign that is billed.
    var id: String { campaignId }

    /// What the route selects of the post. Deliberately not a `Post`:
    /// it carries no counts, no viewer flags and no timestamp, because
    /// an ad has no like, repost or reply of its own to show. Modelling
    /// it as a `Post` would mean a card offering controls with nothing
    /// behind them.
    struct SponsoredPost: Decodable, Equatable {
        let id: String
        let content: String
        let imageUrl: String?
        let imageUrls: [String]?
        let mediaType: String?
        let author: PostAuthor

        /// The first image the route sent, matching the website's own
        /// `imageUrls?.[0] || imageUrl`.
        var displayImageUrl: String? {
            if let first = imageUrls?.first(where: { !$0.isEmpty }) { return first }
            return imageUrl?.isEmpty == false ? imageUrl : nil
        }

        /// Whether that media is a video rather than a still.
        ///
        /// An ad's video is shown as its poster frame with no autoplay:
        /// the feed's single shared player belongs to the timeline, and
        /// handing it to an ad would let a sponsored post interrupt the
        /// video someone was actually watching.
        var isVideo: Bool { mediaType?.lowercased() == "video" }
    }

    private enum CodingKeys: String, CodingKey {
        case campaignId, targetUrl, post
    }
}

/// `GET /api/ads/serve` → `{ad}`, where `ad` is usually null.
struct SponsoredAdResponse: Decodable {
    let ad: SponsoredAd?
}

/// `POST /api/ads/click` → `{logged, redirectUrl}`.
///
/// `redirectUrl` is absent when the campaign stopped being ACTIVE
/// between being served and being clicked - which the route treats as
/// normal rather than as an error, and so does this app.
struct AdClickResponse: Decodable {
    let logged: Bool
    let redirectUrl: String?
}
