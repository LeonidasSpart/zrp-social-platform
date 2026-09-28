import Foundation

/// A pure port of `src/lib/discover-watch-client.ts` - the exact same
/// "which NEW watch-event types should fire now" decision, given real
/// playback progress and what has already been sent for this post in
/// this viewing session (a re-render, an autoplay retry, a mute toggle,
/// or a position tick reporting the same progress twice must never
/// re-fire an event already fired). The actual `POST /api/discover/
/// events` call, and the server's own separate dedup window, live in
/// `DiscoverRepository`/`DiscoverViewModel`; this only decides.
enum DiscoverWatchEvents {

    private struct ProgressThreshold {
        let type: DiscoverEventType
        let ratio: Double
    }

    private static let progressThresholds: [ProgressThreshold] = [
        ProgressThreshold(type: .progress25, ratio: 0.25),
        ProgressThreshold(type: .progress50, ratio: 0.50),
        ProgressThreshold(type: .progress75, ratio: 0.75),
    ]

    /// A real player's position updates arrive at a coarse, OS-driven
    /// interval - the last tick before a clip ends very rarely lands
    /// exactly on its duration. 0.98 treats "close enough to the end" as
    /// complete without requiring an exact match that may never occur
    /// for a given clip length.
    private static let completeRatio = 0.98

    /// Given the current playback position/duration (any consistent
    /// unit - seconds throughout this feature) and the event types
    /// already fired for this post in this viewing session, returns the
    /// new progress-family events (25/50/75/COMPLETE) that should fire
    /// now, in threshold order. Never returns a type already in
    /// `alreadyFired`. Returns an empty list for a non-finite/non-
    /// positive duration (metadata not loaded yet) - there is no
    /// progress ratio to compute.
    static func progressEventsToFire(
        currentPosition: Double,
        duration: Double,
        alreadyFired: Set<DiscoverEventType>
    ) -> [DiscoverEventType] {
        guard duration.isFinite, duration > 0, currentPosition.isFinite, currentPosition >= 0 else {
            return []
        }

        let ratio = min(1.0, max(0.0, currentPosition / duration))
        var toFire: [DiscoverEventType] = []

        for threshold in progressThresholds where ratio >= threshold.ratio && !alreadyFired.contains(threshold.type) {
            toFire.append(threshold.type)
        }

        if ratio >= completeRatio, !alreadyFired.contains(.complete) {
            toFire.append(.complete)
        }

        return toFire
    }

    /// Whether leaving a slide right now should be reported as a SKIP.
    /// Only true once real playback actually started (a bare impression
    /// - scrolled past without ever playing - isn't a "skip", it's just
    /// normal browsing) and only once per post (never re-fired once
    /// already sent, and never sent at all for a post that played all
    /// the way through).
    static func shouldFireSkip(alreadyFired: Set<DiscoverEventType>) -> Bool {
        alreadyFired.contains(.start) && !alreadyFired.contains(.complete) && !alreadyFired.contains(.skip)
    }

    /// Whether an IMPRESSION should fire for a post becoming the active
    /// slide - false if one already fired this session.
    static func shouldFireImpression(alreadyFired: Set<DiscoverEventType>) -> Bool {
        !alreadyFired.contains(.impression)
    }

    /// Same reasoning as `shouldFireImpression`, for the first real
    /// "playing" event.
    static func shouldFireStart(alreadyFired: Set<DiscoverEventType>) -> Bool {
        !alreadyFired.contains(.start)
    }
}
