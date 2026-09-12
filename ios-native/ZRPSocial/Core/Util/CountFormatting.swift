import Foundation

/// Engagement counts abbreviated the way the timeline shows them
/// (1.2K, 3.4M), with the full value kept for VoiceOver.
enum CountFormatting {

    /// Returns `nil` for zero so a count can simply be omitted rather than
    /// rendering a "0" next to every action button - matching how the web
    /// and Android post cards both behave.
    static func compact(_ value: Int) -> String? {
        guard value > 0 else { return nil }
        if value < 1_000 { return "\(value)" }

        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 1
        formatter.minimumFractionDigits = 0
        formatter.locale = L10n.activeLocale

        if value < 1_000_000 {
            let scaled = Double(value) / 1_000
            let number = formatter.string(from: NSNumber(value: scaled)) ?? "\(Int(scaled))"
            return "\(number)K"
        }

        let scaled = Double(value) / 1_000_000
        let number = formatter.string(from: NSNumber(value: scaled)) ?? "\(Int(scaled))"
        return "\(number)M"
    }

    /// A navigation badge: the count up to nine, then "9+".
    ///
    /// The same rule the web sidebar applies to its own unread pips. A
    /// badge sits inside a small capsule beside a row of text, and an
    /// exact four-figure count there would push the label off the row for
    /// no gain - past a certain point "a lot" is the whole message.
    static func badge(_ value: Int) -> String {
        value > 9 ? "9+" : exact(value)
    }

    /// The exact, unabbreviated count, localised - what VoiceOver reads.
    static func exact(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = L10n.activeLocale
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
