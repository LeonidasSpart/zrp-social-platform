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

    /// The exact, unabbreviated count, localised - what VoiceOver reads.
    static func exact(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = L10n.activeLocale
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
