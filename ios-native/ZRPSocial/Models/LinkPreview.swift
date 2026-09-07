import Foundation

/// What `GET /api/link-preview?url=…` unfurls from a link.
///
/// Every field but `url` and `isVideo` is nullable, and the route
/// deliberately answers a fully-null shape (with a 200) for a link it
/// could not read - a cached "nothing found" - rather than an error. So
/// a decoded value is not by itself a preview worth showing; see
/// `isRenderable`.
struct LinkPreview: Decodable, Equatable {

    /// The canonical URL the route resolved to. For a YouTube link this
    /// is normalised, so it is not always the URL that was asked for.
    let url: String

    let title: String?
    let description: String?
    let image: String?
    let siteName: String?

    /// True when the page's own metadata says it plays something -
    /// `og:type=video` or `twitter:card=player` - which is broader than
    /// "this is YouTube". Purely an affordance: nothing is embedded, and
    /// the card opens the original page either way.
    let isVideo: Bool

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        url = try container.decode(String.self, forKey: .url)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        image = try container.decodeIfPresent(String.self, forKey: .image)
        siteName = try container.decodeIfPresent(String.self, forKey: .siteName)
        isVideo = try container.decodeIfPresent(Bool.self, forKey: .isVideo) ?? false
    }

    private enum CodingKeys: String, CodingKey {
        case url, title, description, image, siteName, isVideo
    }

    /// Whether there is anything worth drawing a card around.
    ///
    /// Matches the website's rule exactly: a title or an image. Without
    /// either, the link in the post text is already tappable and an
    /// empty card would only look broken.
    var isRenderable: Bool {
        title?.isEmpty == false || image?.isEmpty == false
    }

    /// What to label the card with: the site's own name, else its host
    /// without a `www.` prefix.
    var domain: String {
        if let siteName, !siteName.isEmpty { return siteName }
        guard let host = URL(string: url)?.host() else { return "" }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}
