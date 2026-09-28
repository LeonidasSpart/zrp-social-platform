package one.zrp.social.mobile.ui.discover

import one.zrp.social.mobile.network.DiscoverEventType

/**
 * Pure port of src/lib/discover-watch-client.ts - the exact same "which
 * NEW watch-event types should fire now" decision, given real playback
 * progress and what's already been sent for this post this session (a
 * re-render, a remount, an autoplay retry, a mute toggle, or a position
 * tick reporting the same progress twice must never re-fire an event
 * already fired). The actual POST /api/discover/events call and its own
 * server-side dedup window live in DiscoverViewModel/DiscoverRepository;
 * this module only decides.
 */

private data class ProgressThreshold(val type: DiscoverEventType, val ratio: Double)

private val PROGRESS_THRESHOLDS = listOf(
    ProgressThreshold(DiscoverEventType.PROGRESS_25, 0.25),
    ProgressThreshold(DiscoverEventType.PROGRESS_50, 0.50),
    ProgressThreshold(DiscoverEventType.PROGRESS_75, 0.75),
)

// A real player's position updates arrive at a coarse, OS-controlled
// interval - the last tick before a clip ends very rarely lands exactly
// on `duration`. 0.98 treats "close enough to the end" as complete
// without requiring an exact match that may never occur for a given
// clip length.
private const val COMPLETE_RATIO = 0.98

/**
 * Given current playback position/duration (any consistent unit - ms
 * throughout in this app) and the event types already fired for this
 * post in this viewing session, returns the new progress-family events
 * (25/50/75/COMPLETE) that should fire now, in threshold order. Never
 * returns a type already in [alreadyFired]. Returns an empty list for a
 * non-finite/non-positive duration (metadata not loaded yet) - there is
 * no progress ratio to compute.
 */
internal fun getProgressEventsToFire(
    currentPositionMs: Long,
    durationMs: Long,
    alreadyFired: Set<DiscoverEventType>,
): List<DiscoverEventType> {
    if (durationMs <= 0 || currentPositionMs < 0) return emptyList()

    val ratio = (currentPositionMs.toDouble() / durationMs.toDouble()).coerceIn(0.0, 1.0)
    val toFire = mutableListOf<DiscoverEventType>()

    for (threshold in PROGRESS_THRESHOLDS) {
        if (ratio >= threshold.ratio && threshold.type !in alreadyFired) {
            toFire += threshold.type
        }
    }

    if (ratio >= COMPLETE_RATIO && DiscoverEventType.COMPLETE !in alreadyFired) {
        toFire += DiscoverEventType.COMPLETE
    }

    return toFire
}

/**
 * Whether leaving a slide right now should be reported as a SKIP. Only
 * true once real playback actually started (a bare impression -
 * scrolled past without ever playing - isn't a "skip", it's just normal
 * browsing) and only once per post (never re-fired once already sent,
 * and never sent at all for a post that played all the way through).
 */
internal fun shouldFireSkip(alreadyFired: Set<DiscoverEventType>): Boolean {
    return DiscoverEventType.START in alreadyFired &&
        DiscoverEventType.COMPLETE !in alreadyFired &&
        DiscoverEventType.SKIP !in alreadyFired
}

/** Whether an IMPRESSION should fire for a post becoming the active slide - false if one already fired this session. */
internal fun shouldFireImpression(alreadyFired: Set<DiscoverEventType>): Boolean {
    return DiscoverEventType.IMPRESSION !in alreadyFired
}

/** Same reasoning as [shouldFireImpression], for the first real "playing" event. */
internal fun shouldFireStart(alreadyFired: Set<DiscoverEventType>): Boolean {
    return DiscoverEventType.START !in alreadyFired
}
