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

    /// `DateFormatter` is expensive to build, so these are cached - but
    /// cached **per locale**, not once for the process. The in-app
    /// language picker can change the active locale while the app is
    /// running, and a formatter built before that change would keep
    /// printing month names in the previous language forever.
    nonisolated(unsafe) private static var formatterCache: [String: DateFormatter] = [:]
    private static let cacheLock = NSLock()

    private static func formatter(
        _ id: String,
        build: (DateFormatter) -> Void
    ) -> DateFormatter {
        let locale = L10n.activeLocale
        let key = "\(id)|\(locale.identifier)"

        cacheLock.lock()
        defer { cacheLock.unlock() }

        if let cached = formatterCache[key] { return cached }

        let formatter = DateFormatter()
        formatter.locale = locale
        build(formatter)
        formatterCache[key] = formatter
        return formatter
    }

    private static var dateFormatter: DateFormatter {
        formatter("medium") { formatter in
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
        }
    }

    private static var sameYearFormatter: DateFormatter {
        formatter("sameYear") { formatter in
            // Locale-appropriate day+month ordering rather than a fixed
            // "MMM d", which reads wrong in most of ZRP's 11 languages.
            formatter.setLocalizedDateFormatFromTemplate("MMMd")
        }
    }

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
        formatter("accessible") { formatter in
            formatter.dateStyle = .long
            formatter.timeStyle = .short
        }
        .string(from: date)
    }
}
