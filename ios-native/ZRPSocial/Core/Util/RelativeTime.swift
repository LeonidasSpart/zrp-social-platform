import Foundation

/// Timestamps in the compact form a timeline needs ("3m", "5h", "2d"),
/// matching how the web app and the Android app both render post ages.
///
/// `RelativeDateTimeFormatter` on its own produces "3 minutes ago", which
/// is far too wide for a post header, so the short units are built here
/// and only the older-than-a-week case falls through to a real formatted
/// date. Everything is locale-aware: the date branch uses the user's
/// locale and calendar rather than a hardcoded format.
enum RelativeTime {

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    private static let sameYearFormatter: DateFormatter = {
        let formatter = DateFormatter()
        // Locale-appropriate day+month ordering rather than a fixed
        // "MMM d", which reads wrong in most of ZRP's 11 languages.
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        return formatter
    }()

    static func compact(from date: Date, now: Date = Date()) -> String {
        let seconds = now.timeIntervalSince(date)

        // A clock skew between device and server can put a fresh post a
        // few seconds in the future. Show "now" rather than a negative age.
        guard seconds >= 0 else { return "now" }

        if seconds < 60 { return "\(Int(seconds))s" }

        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(minutes)m" }

        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }

        let days = hours / 24
        if days < 7 { return "\(days)d" }

        let calendar = Calendar.current
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            return sameYearFormatter.string(from: date)
        }
        return dateFormatter.string(from: date)
    }

    /// The full, spelled-out timestamp for VoiceOver, where the compact
    /// form ("3h") would be read as meaningless.
    static func accessible(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
