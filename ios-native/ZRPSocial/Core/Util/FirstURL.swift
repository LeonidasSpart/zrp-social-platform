import Foundation

/// Finds the URL a post should unfurl.
///
/// A faithful port of the website's `extractFirstUrl`, deliberately
/// including its trailing-punctuation rules - the two must agree, or the
/// same post would unfurl a different link on each platform and the
/// server's preview cache would be keyed twice for one link.
enum FirstURL {

    /// Characters a sentence commonly ends with that are not part of the
    /// link. `)` is handled separately, below.
    private static let trailingPunctuation = CharacterSet(charactersIn: ".,!?;:'\"]}")

    static func first(in content: String) -> String? {
        guard let match = scan(content) else { return nil }

        var raw = match
        while let last = raw.unicodeScalars.last, trailingPunctuation.contains(last) {
            raw = String(raw.dropLast())
        }

        // A trailing `)` is ambiguous: usually it closes a parenthetical
        // around the link, but some URLs legitimately end in one - a
        // Wikipedia `..._(disambiguation)`, say. It is stripped only when
        // the URL does not itself contain a matching open bracket, which
        // is the same balance heuristic the website uses.
        while raw.hasSuffix(")") {
            let opens = raw.filter { $0 == "(" }.count
            let closes = raw.filter { $0 == ")" }.count
            if closes <= opens { break }
            raw = String(raw.dropLast())
        }

        guard !raw.isEmpty else { return nil }
        // A bare `www.` link is not a URL until it has a scheme; the
        // website assumes https for it and so does this.
        return raw.hasPrefix("http") ? raw : "https://\(raw)"
    }

    /// The first `http(s)://…` or `www.…` run of non-whitespace, which is
    /// what the website's regex matches.
    private static func scan(_ content: String) -> String? {
        for token in content.split(whereSeparator: { $0.isWhitespace || $0.isNewline }) {
            if let range = token.range(of: "http://") ?? token.range(of: "https://") {
                return String(token[range.lowerBound...])
            }
            if let range = token.range(of: "www.") {
                return String(token[range.lowerBound...])
            }
        }
        return nil
    }
}
