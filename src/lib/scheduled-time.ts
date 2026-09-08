// Resolves the `scheduledAt` a client sends when creating a scheduled
// post into the real Date instance to store. Exists because `<input
// type="datetime-local">` (what the web composer's field is bound to)
// produces a naive "yyyy-MM-ddTHH:mm" string with no timezone
// information at all - ECMAScript parses a date-time form like that as
// local time IN WHATEVER ENVIRONMENT PARSES IT, which on the server
// means the server's own zone (UTC in production), not the author's.
// An author in UTC+9 scheduling for "09:00" therefore got it published
// at 09:00 UTC - 18:00 for them - and the further from UTC an author is,
// the worse the drift. See ios-native/PARITY.md's F2 finding.
//
// This is a drop-in replacement for `new Date(scheduledAt)` (same
// return contract, including producing an Invalid Date for garbage
// input - this function does not itself validate the result) that
// additionally understands two ways a caller can be unambiguous:
//
//   1. `scheduledAt` already carries a real offset or "Z" suffix (a
//      genuine ISO-8601 instant) - already parsed correctly by the
//      native Date constructor regardless of server timezone, so nothing
//      to correct.
//   2. `scheduledAt` is the naive wall-clock string, and the caller also
//      sends `scheduledAtOffsetMinutes` - the exact value
//      `Date.prototype.getTimezoneOffset()` reports in the author's own
//      timezone at that moment (e.g. UTC+9 reports -540). The true
//      instant is then the wall-clock components read as UTC, plus that
//      offset.
//
// Neither field is required: a caller that sends neither (every existing
// client today) gets byte-for-byte the same behavior as before - a
// naive string parsed in the server's own timezone. This is the
// backward-compatible bridge that lets a client become correct by
// sending one additional field, without requiring every client to
// switch at once.
const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

export function resolveScheduledAt(rawScheduledAt: unknown, rawOffsetMinutes?: unknown): Date {
  if (typeof rawScheduledAt !== "string") {
    return new Date(rawScheduledAt as string);
  }

  const trimmed = rawScheduledAt.trim();

  if (OFFSET_SUFFIX.test(trimmed)) {
    return new Date(trimmed);
  }

  const offsetMinutes =
    typeof rawOffsetMinutes === "number" ? rawOffsetMinutes : Number(rawOffsetMinutes);

  if (Number.isFinite(offsetMinutes)) {
    const match = trimmed.match(NAIVE_WALL_CLOCK);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const naiveAsUtcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        second ? Number(second) : 0
      );
      return new Date(naiveAsUtcMs + offsetMinutes * 60_000);
    }
  }

  return new Date(trimmed);
}
