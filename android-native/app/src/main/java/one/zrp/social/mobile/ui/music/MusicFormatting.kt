package one.zrp.social.mobile.ui.music

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MusicTrack
import kotlin.math.roundToInt

// Ported from src/lib/music/duration.ts's own sumDurationSec() - only
// counts tracks with a real, positive durationSec (an unset or zero
// duration never contributes, rather than counting as "0 seconds"
// which would be indistinguishable from a genuinely instant track).
fun sumDurationSec(tracks: List<MusicTrack>): Int =
    tracks.sumOf { val d = it.durationSec; if (d != null && d > 0) d else 0 }

// Ported from src/lib/music/duration.ts's own formatTotalDuration() -
// "38 min" under an hour, "1 hr 12 min" (or "1 hr" with nothing left
// over) at or above one hour, matching the exact same rounding.
@Composable
fun formatTotalDuration(totalSeconds: Int): String {
    val totalMinutes = (totalSeconds / 60.0).roundToInt()
    if (totalMinutes < 60) return stringResource(R.string.music_duration_minutes, totalMinutes)
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (minutes > 0) {
        stringResource(R.string.music_duration_hours_minutes, hours, minutes)
    } else {
        stringResource(R.string.music_duration_hours_only, hours)
    }
}

// Ported from TrackList.tsx's own local formatDuration() - "--:--" for
// a track with no known duration yet, not "0:00" (which would falsely
// read as an instant track).
fun formatTrackDuration(seconds: Int?): String {
    if (seconds == null || seconds <= 0) return "--:--"
    val m = seconds / 60
    val s = seconds % 60
    return "$m:${s.toString().padStart(2, '0')}"
}
