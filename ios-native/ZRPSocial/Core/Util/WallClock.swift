import Foundation

/// The naive wall-clock format the post route is written against.
///
/// `yyyy-MM-dd'T'HH:mm` with no timezone and no seconds - byte for byte
/// what a browser's `<input type="datetime-local">` submits. The route
/// passes the string to `new Date(...)`, so a value carrying an offset
/// would be read as that instant while one without is read in the
/// server's own zone. Both clients must therefore send the SAME shape,
/// or the same wall-clock time schedules to two different instants.
enum WallClock {

    /// A fixed POSIX locale and Gregorian calendar: the string is a wire
    /// format, not something anyone reads, so it must not follow the
    /// device's calendar or numbering system. A Buddhist or Persian
    /// calendar, or Eastern Arabic digits, would produce a year the
    /// server cannot parse.
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter
    }()

    /// The date as it reads on this device's clock.
    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }
}
