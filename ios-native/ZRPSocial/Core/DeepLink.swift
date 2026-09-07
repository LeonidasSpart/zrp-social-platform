import Foundation

/// Where a zrp.one link leads inside the app.
///
/// A tab and, when the link names something deeper than that tab's root,
/// a route to push into it.
struct DeepLinkTarget: Equatable {
    let tab: MainTab
    let route: Route?

    init(_ tab: MainTab, _ route: Route? = nil) {
        self.tab = tab
        self.route = route
    }
}

/// Translates a ZRP web URL into the screen that shows the same thing.
///
/// One parser for every source of an incoming link: universal links, a
/// notification's payload, and a zrp.one URL tapped inside a post. The
/// paths are the website's own - `/post/{id}`, `/profile/{username}`,
/// `/hashtag/{tag}` and the rest - and are the same ones Android
/// registers as App Links, so a link shared from any ZRP client opens the
/// same place on both.
///
/// Anything this app has no screen for returns `nil`, and the caller
/// falls back to opening the page on the web. That is deliberate: a link
/// to a module iOS has not built yet should show the real page in a
/// browser, not be swallowed by the app.
enum DeepLink {

    /// The one domain the app claims. Matched case-insensitively, with an
    /// optional `www.`, because links are shared as typed.
    static func isZrpHost(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return host == "zrp.one" || host == "www.zrp.one"
    }

    /// The target a URL names, or `nil` if the app has no screen for it.
    ///
    /// Only `https` on the ZRP domain is accepted. A link on any other
    /// host is somebody else's page and is never claimed.
    static func target(for url: URL) -> DeepLinkTarget? {
        guard url.scheme?.lowercased() == "https", isZrpHost(url) else { return nil }
        return target(forPath: url.path)
    }

    /// Split out so the same mapping can be applied to a bare path - what
    /// a notification payload carries - without inventing a URL for it.
    static func target(forPath path: String) -> DeepLinkTarget? {
        let segments = path
            .split(separator: "/", omittingEmptySubsequences: true)
            .map { String($0).removingPercentEncoding ?? String($0) }

        guard let first = segments.first else {
            // "https://zrp.one" and "https://zrp.one/" are the timeline.
            return DeepLinkTarget(.home)
        }

        let second = segments.count > 1 ? segments[1] : nil
        let third = segments.count > 2 ? segments[2] : nil

        switch first {
        case "search":
            return DeepLinkTarget(.search)
        case "notifications":
            return DeepLinkTarget(.notifications)

        case "messages":
            // `/messages/{username}` opens a thread on the web, but this
            // app pushes a conversation with a `PostAuthor` it does not
            // have from a username alone. The inbox is the honest
            // destination until the thread route accepts a handle.
            return DeepLinkTarget(.messages)

        case "shorts":
            // The website's /shorts is the feed; a post id after it opens
            // that video, which is exactly what the route's own startId
            // parameter is for.
            return DeepLinkTarget(.home, .shorts(startId: second))

        case "bookmarks":
            return DeepLinkTarget(.home, .bookmarks)
        case "settings":
            return DeepLinkTarget(.home, .settings)

        case "post":
            guard let id = second else { return nil }
            return DeepLinkTarget(.home, .postDetail(postId: id, preloaded: nil))

        case "profile":
            guard let username = second else { return nil }
            return DeepLinkTarget(.home, .profile(username: normalized(username)))

        case "trust":
            guard let username = second else { return nil }
            return DeepLinkTarget(.home, .trustPassport(username: normalized(username)))

        case "hashtag":
            guard let tag = second else { return nil }
            return DeepLinkTarget(.home, .hashtag(tag: normalized(tag, prefix: "#")))

        case "music":
            return DeepLinkTarget(.home, musicRoute(second, third) ?? .music)

        case "marketplace":
            return DeepLinkTarget(.home, marketplaceRoute(second, third) ?? .marketplace)

        default:
            // `/{username}` is the website's short form of
            // `/profile/{username}`. Claimed last, so it can never
            // shadow a real section - a module iOS has not built yet
            // falls through to the web rather than opening a profile
            // page for a word like "play".
            guard segments.count == 1, isPlausibleUsername(first) else { return nil }
            return DeepLinkTarget(.home, .profile(username: normalized(first)))
        }
    }

    private static func musicRoute(_ second: String?, _ third: String?) -> Route? {
        switch second {
        case nil: return .music
        case "discover": return .musicDiscover
        case "artists": return third.map { .musicArtist(id: $0) } ?? .musicArtists
        case "albums": return third.map { .musicAlbum(id: $0) } ?? .musicAlbums
        case "playlists": return third.map { .musicPlaylist(id: $0) } ?? .musicPlaylists
        case "liked": return .musicLiked
        case "history": return .musicHistory
        case "queue": return .musicQueue
        default: return nil
        }
    }

    private static func marketplaceRoute(_ second: String?, _ third: String?) -> Route? {
        switch second {
        case nil: return .marketplace
        case "listing": return third.map { .listingDetail(id: $0) }
        case "favorites": return .listingFavorites
        case "my-listings": return .myListings
        case "new": return .listingCompose(listingId: nil)
        default: return nil
        }
    }

    /// Strips the `@` or `#` a shared link sometimes carries, so
    /// `/@leonidas` and `/profile/leonidas` reach the same screen.
    private static func normalized(_ value: String, prefix: Character = "@") -> String {
        value.first == prefix ? String(value.dropFirst()) : value
    }

    /// A single unmatched segment is only treated as a username when it
    /// looks like one. ZRP usernames are letters, digits and underscores;
    /// anything with a dot, a dash or a space is far more likely to be a
    /// page this app does not know about.
    private static func isPlausibleUsername(_ value: String) -> Bool {
        let candidate = normalized(value)
        guard !candidate.isEmpty, candidate.count <= 40 else { return false }
        return candidate.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
    }
}

/// Holds a link that arrived before the app could act on it.
///
/// A universal link can arrive at launch, while the session is still
/// being restored, or while the reader is signed out and looking at the
/// login screen. The tab shell only exists once they are signed in, so
/// the URL waits here and is consumed when there is somewhere to put it -
/// rather than being dropped, which is what tapping a link and landing on
/// a bare timeline feels like.
@MainActor
final class DeepLinkInbox: ObservableObject {

    @Published private(set) var pending: URL?

    func receive(_ url: URL) {
        pending = url
    }

    /// Returns the waiting link, if any, and clears it.
    func take() -> URL? {
        defer { pending = nil }
        return pending
    }
}
