import SwiftUI

/// Post text with `#hashtags`, `@mentions`, and bare URLs made tappable.
///
/// Built as an `AttributedString` and rendered by a single `Text`, so it
/// wraps, honours Dynamic Type, and is read by VoiceOver as one passage -
/// none of which a stack of per-word views would do.
///
/// Internal taps use a private `zrp://` scheme intercepted by the
/// `openURL` handler below, rather than a real link, so a hashtag can
/// route inside the app instead of leaving it. Web links open in Safari.
struct LinkifiedText: View {

    let content: String
    var onHashtag: ((String) -> Void)?
    var onMention: ((String) -> Void)?

    /// Called for a zrp.one link that names a screen this app has. Web
    /// links to anywhere else - and to ZRP pages iOS has not built - keep
    /// going to Safari.
    var onZrpLink: ((Route) -> Void)?

    /// The scheme is never registered in Info.plist. It exists only as a
    /// marker inside the attributed string and is always consumed by the
    /// handler below, so nothing outside the app can ever be launched
    /// with it - it is not a deep-link surface.
    private static let internalScheme = "zrp-inline"

    var body: some View {
        Text(attributed)
            .font(.body)
            .foregroundStyle(ZrpColor.onSurface)
            .tint(ZrpColor.red)
            .textSelection(.enabled)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == Self.internalScheme else {
                    // A ZRP link inside a post opens the app's own screen
                    // for it - leaving the app to read a ZRP post in
                    // Safari, signed out, would be absurd. Everything
                    // else, including ZRP pages this app has no screen
                    // for, goes to the system so it opens in Safari with
                    // the usual protections rather than in an in-app web
                    // view that would hide the address from the reader.
                    if let onZrpLink, let route = DeepLink.target(for: url)?.route {
                        onZrpLink(route)
                        return .handled
                    }
                    return .systemAction
                }
                let value = String(url.path().dropFirst()).removingPercentEncoding
                    ?? String(url.path().dropFirst())
                switch url.host() {
                case "hashtag":
                    onHashtag?(value)
                case "mention":
                    onMention?(value)
                default:
                    break
                }
                return .handled
            })
    }

    private var attributed: AttributedString {
        var result = AttributedString(content)

        // Only style a hashtag or mention as a link when there is
        // somewhere for it to go. Until the profile and hashtag screens
        // exist (Phases 6 and 12) the host view passes no handler, and
        // colouring the token like a link would promise a tap that does
        // nothing. Web links always linkify - the system can always open
        // one.
        for token in Self.tokens(in: content, includeHashtags: onHashtag != nil, includeMentions: onMention != nil) {
            guard let range = Self.range(of: token, in: &result) else { continue }
            result[range].link = token.url
            result[range].foregroundColor = ZrpColor.red
        }
        return result
    }

    // MARK: - Tokenising

    private struct Token {
        let text: String
        let range: Range<String.Index>
        let url: URL
    }

    /// Matches the same three things the web app's post renderer does.
    /// Hashtag and mention bodies are restricted to word characters so a
    /// trailing comma or full stop is not swallowed into the tag.
    private static let detectors: [(pattern: String, kind: String)] = [
        ("#[\\p{L}0-9_]+", "hashtag"),
        ("@[A-Za-z0-9_]+", "mention"),
        ("https?://[^\\s<>\"]+", "web"),
    ]

    private static func tokens(
        in content: String,
        includeHashtags: Bool,
        includeMentions: Bool
    ) -> [Token] {
        var tokens: [Token] = []

        for (pattern, kind) in detectors {
            if kind == "hashtag" && !includeHashtags { continue }
            if kind == "mention" && !includeMentions { continue }
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let nsRange = NSRange(content.startIndex..<content.endIndex, in: content)

            regex.enumerateMatches(in: content, range: nsRange) { match, _, _ in
                guard
                    let match,
                    let range = Range(match.range, in: content)
                else { return }

                let text = String(content[range])
                let url: URL?
                switch kind {
                case "hashtag":
                    url = URL(string: "\(internalScheme)://hashtag/\(encode(String(text.dropFirst())))")
                case "mention":
                    url = URL(string: "\(internalScheme)://mention/\(encode(String(text.dropFirst())))")
                default:
                    url = URL(string: text)
                }
                guard let url else { return }
                tokens.append(Token(text: text, range: range, url: url))
            }
        }
        return tokens
    }

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }

    private static func range(
        of token: Token,
        in attributed: inout AttributedString
    ) -> Range<AttributedString.Index>? {
        // Re-finding by text rather than converting String.Index across
        // types: an AttributedString does not share indices with the
        // String it was built from, and the first unstyled occurrence is
        // always the right one because tokens are applied in order.
        var searchStart = attributed.startIndex
        while let found = attributed[searchStart...].range(of: token.text) {
            if attributed[found].link == nil {
                return found
            }
            guard found.upperBound < attributed.endIndex else { break }
            searchStart = found.upperBound
        }
        return nil
    }
}
