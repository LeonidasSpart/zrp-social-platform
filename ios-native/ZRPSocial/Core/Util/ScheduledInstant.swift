import Foundation

/// A moment in time, written the one way that cannot be misread.
///
/// This replaces the naive `yyyy-MM-dd'T'HH:mm` wall-clock string this
/// app used to send for `scheduledAt` and a poll's `expiresAt`. That
/// shape carries **no timezone at all**, and both routes hand it to
/// JavaScript's `new Date(...)`, which reads an offset-less date-time as
/// local time *in whatever environment parses it* - on the server, UTC.
/// So an author in UTC+9 scheduling for 09:00 got 09:00 UTC: 18:00 their
/// time, and the further from UTC an author is, the worse the drift.
///
/// An ISO-8601 instant with a `Z` suffix has no such ambiguity. It names
/// one moment, and every parser on either side agrees which one.
///
/// **Both routes already accept it, today, with no backend change.**
/// `POST /api/posts` resolves `scheduledAt` through
/// `src/lib/scheduled-time.ts`'s `resolveScheduledAt`, whose first
/// branch is exactly "already carries a real offset or Z - parse it
/// directly". A poll's `expiresAt` is still a bare `new Date(...)`, and
/// that is precisely why sending an instant matters there too: a bare
/// `new Date` is correct for an absolute instant and wrong for a naive
/// one.
///
/// The contract also offers a second path - keep the naive string and
/// add `scheduledAtOffsetMinutes`. This app takes the first path
/// instead: one field rather than two, nothing to keep in sync, no
/// sign-convention to get backwards, and it works for the poll route,
/// which knows nothing about the second field.
enum ScheduledInstant {

    /// A fixed POSIX locale and Gregorian calendar, for the same reason
    /// the wall-clock formatter before it did: this is a wire format,
    /// not something anyone reads, so it must not follow the device's
    /// calendar or numbering system. A Buddhist or Persian calendar, or
    /// Eastern Arabic digits, would produce a year the server cannot
    /// parse.
    ///
    /// Seconds are included and fractional seconds are not - the shape
    /// `resolveScheduledAt`'s offset check matches, and the shape the
    /// rest of this app already decodes.
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
        return formatter
    }()

    /// The instant this date names, in UTC.
    ///
    /// The author picked a time on their own clock; `Date` already holds
    /// the absolute moment that choice resolved to in their timezone, so
    /// nothing here needs to know what that timezone was. Rendering it
    /// as UTC is only how it is written down.
    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }
}
