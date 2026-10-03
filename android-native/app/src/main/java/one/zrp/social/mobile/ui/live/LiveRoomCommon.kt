package one.zrp.social.mobile.ui.live

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveRoomKind
import one.zrp.social.mobile.network.LiveAudioHost
import one.zrp.social.mobile.network.LiveRecording
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.parseIsoMillis
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** The public zrp.one URL for a room - registered as a deep link in ZrpNavHost, so a shared link opens natively. */
fun liveRoomUrl(kind: LiveRoomKind, roomId: String): String = "https://zrp.one/${kind.pathSegment}/$roomId"

fun shareLiveRoom(context: Context, kind: LiveRoomKind, roomId: String, title: String?, chooserTitle: String) {
    val url = liveRoomUrl(kind, roomId)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, if (title.isNullOrBlank()) url else "$title\n$url")
    }
    runCatching { context.startActivity(Intent.createChooser(send, chooserTitle)) }
}

private val isoOutFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
}

/** ISO-8601 UTC for a scheduledAt request body - SimpleDateFormat, not java.time (minSdk 24, no desugaring). */
fun liveIsoFromMillis(millis: Long): String = isoOutFormat.get()!!.format(Date(millis))

/** Localised weekday/date/time for a room's scheduledAt (device locale and time zone). */
fun formatLiveScheduledAt(context: Context, iso: String?): String? {
    val millis = iso?.let { parseIsoMillis(it) } ?: return null
    return DateUtils.formatDateTime(
        context,
        millis,
        DateUtils.FORMAT_SHOW_WEEKDAY or DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_ABBREV_ALL,
    )
}

private fun formatDuration(totalSeconds: Int): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s) else String.format(Locale.US, "%d:%02d", m, s)
}

/**
 * "Recording" indicator shown to EVERYONE in the room while a recording
 * is known to be running - participants should know they're recorded.
 */
@Composable
fun LiveRecordingPill(onMedia: Boolean, modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .background(if (onMedia) Color.Black.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(50))
            .padding(horizontal = Spacing.sm, vertical = 2.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Icon(Icons.Filled.Circle, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(10.dp))
        Text(
            text = stringResource(R.string.live_recording_indicator),
            style = MaterialTheme.typography.labelSmall,
            color = if (onMedia) Color.White else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = Spacing.xs),
        )
    }
}

/**
 * The host/moderator recording control, as overflow-menu items. Wired to
 * the real start/stop routes. When the server answers
 * replay_not_configured (503 - no cloud storage for LiveKit Egress on
 * this deployment yet) the item stays visible and says so, rather than
 * disappearing or pretending to record.
 */
@Composable
fun LiveRecordingMenuItems(state: LiveRecordingState, onStart: () -> Unit, onStop: () -> Unit, onDismissMenu: () -> Unit) {
    if (state.isRecording) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.live_recording_stop)) },
            leadingIcon = { Icon(Icons.Filled.Circle, contentDescription = null, tint = ZrpRed) },
            enabled = !state.busy,
            onClick = {
                onDismissMenu()
                onStop()
            },
        )
    } else {
        DropdownMenuItem(
            text = {
                Column {
                    Text(stringResource(R.string.live_recording_start))
                    if (state.unavailable) {
                        Text(
                            text = stringResource(R.string.live_recording_unavailable),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            leadingIcon = { Icon(Icons.Filled.Circle, contentDescription = null) },
            enabled = !state.busy,
            onClick = {
                onDismissMenu()
                onStart()
            },
        )
    }
}

/** A short-lived confirmation (e.g. "Gift sent") that clears itself; announced politely to TalkBack. */
@Composable
fun LiveTransientNotice(text: String?, onExpired: () -> Unit, modifier: Modifier = Modifier) {
    if (text == null) return
    LaunchedEffect(text) {
        delay(2_500)
        onExpired()
    }
    Text(
        text = text,
        color = Color.White,
        style = MaterialTheme.typography.labelLarge,
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(50))
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/**
 * Completed recordings for an ended room, from the real GET .../replay.
 * An empty list is the normal case today (no Egress storage is
 * configured, so nothing can have been recorded) and gets an honest
 * empty state - never sample rows. A row's Play hands the real
 * `mediaUrl` to whatever app handles it.
 */
@Composable
fun LiveReplaysSection(
    state: LiveRecordingState,
    canDelete: Boolean,
    onRetry: () -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var confirmDeleteId by remember { mutableStateOf<String?>(null) }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.live_replays_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        when {
            state.replaysLoading && !state.replaysLoaded -> Box(Modifier.fillMaxWidth().padding(Spacing.lg), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.size(IconSize.md))
            }
            state.replaysError != null && !state.replaysLoaded -> Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.md),
            ) {
                Text(text = stringResource(R.string.live_replays_error), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry)) }
            }
            state.replays.isEmpty() -> ZrpEmptyState(
                icon = Icons.Filled.VideoLibrary,
                title = stringResource(R.string.live_replays_empty_title),
                body = stringResource(R.string.live_replays_empty_body),
            )
            else -> {
                state.replays.forEach { recording ->
                    ReplayRow(
                        recording = recording,
                        canDelete = canDelete,
                        deleting = state.deletingReplayId == recording.id,
                        onPlay = { url -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } },
                        onDelete = { confirmDeleteId = recording.id },
                    )
                    HorizontalDivider()
                }
                val error = liveErrorText(state.replaysError)
                if (error != null) {
                    Text(text = error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = Spacing.xs))
                }
            }
        }
    }

    val deleteId = confirmDeleteId
    if (deleteId != null) {
        AlertDialog(
            onDismissRequest = { confirmDeleteId = null },
            title = { Text(stringResource(R.string.live_replay_delete_confirm_title)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDeleteId = null
                    onDelete(deleteId)
                }) { Text(stringResource(R.string.live_replay_delete), color = ZrpRed) }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteId = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
private fun ReplayRow(recording: LiveRecording, canDelete: Boolean, deleting: Boolean, onPlay: (String) -> Unit, onDelete: () -> Unit) {
    val context = LocalContext.current
    val playable = recording.mediaUrl?.startsWith("https://") == true
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.sm)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = formatLiveScheduledAt(context, recording.startedAt) ?: "",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val duration = recording.durationSeconds
            if (duration != null && duration > 0) {
                Text(text = formatDuration(duration), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (playable) {
            IconButton(onClick = { recording.mediaUrl?.let(onPlay) }) {
                Icon(Icons.Filled.PlayArrow, contentDescription = stringResource(R.string.live_replay_play))
            }
        }
        if (canDelete) {
            if (deleting) {
                CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.live_replay_delete))
                }
            }
        }
    }
}

/**
 * The terminal screen for an ended/cancelled room (or one I was removed
 * from): what happened, the room's replays when it actually ENDED, and
 * the way back.
 */
@Composable
fun LiveEndedContent(
    title: String,
    showReplays: Boolean,
    recordingState: LiveRecordingState,
    canDeleteReplays: Boolean,
    backLabel: String,
    onLoadReplays: () -> Unit,
    onDeleteReplay: (String) -> Unit,
    onBack: () -> Unit,
) {
    if (showReplays) {
        LaunchedEffect(Unit) { onLoadReplays() }
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Button(
            onClick = onBack,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = Color.White),
            modifier = Modifier.padding(top = Spacing.lg),
        ) {
            Text(backLabel)
        }
        if (showReplays) {
            LiveReplaysSection(
                state = recordingState,
                canDelete = canDeleteReplays,
                onRetry = onLoadReplays,
                onDelete = onDeleteReplay,
                modifier = Modifier.padding(top = Spacing.xl).widthIn(max = 520.dp),
            )
        }
    }
}

/**
 * A SCHEDULED (not yet started) room. GET /rooms/{id} works for it, but
 * POST /join would fail with room_not_live, so instead of a dead-end
 * join error this shows when it starts and the one real action each
 * person has: the host can start it now (or cancel it), and everyone
 * else can turn on a reminder - delivered server-side as a real
 * notification the moment the host starts it (no polling here).
 */
@Composable
fun LiveScheduledRoomContent(
    title: String,
    description: String?,
    scheduledAtIso: String?,
    host: LiveAudioHost?,
    isHost: Boolean,
    reminder: LiveReminderState,
    hostActionBusy: Boolean,
    hostActionError: String?,
    onSetReminder: (Boolean) -> Unit,
    onStartNow: () -> Unit,
    onCancelRoom: () -> Unit,
    onShare: () -> Unit,
    onCheckAgain: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var confirmCancel by remember { mutableStateOf(false) }
    val whenText = formatLiveScheduledAt(context, scheduledAtIso)

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.xs, vertical = Spacing.xs),
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.live_scheduled_badge),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(start = Spacing.xs),
            )
            IconButton(onClick = onShare) {
                Icon(Icons.Filled.Share, contentDescription = stringResource(R.string.action_share))
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.xl, vertical = Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier.size(64.dp).background(ZrpRed.copy(alpha = 0.10f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(IconSize.lg))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            if (whenText != null) {
                Text(
                    text = stringResource(R.string.live_scheduled_starts_at, whenText),
                    style = MaterialTheme.typography.bodyLarge,
                    color = ZrpRed,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }
            if (host != null) {
                val hostName = host.name ?: host.username
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Spacing.md)) {
                    Avatar(url = host.avatarUrl, name = hostName, size = 28.dp)
                    Text(
                        text = stringResource(R.string.live_audio_hosted_by, hostName),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = Spacing.sm),
                    )
                }
            }
            if (!description.isNullOrBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.md).widthIn(max = 520.dp),
                )
            }

            if (isHost) {
                Text(
                    text = stringResource(R.string.live_scheduled_host_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.xl),
                )
                Button(
                    onClick = onStartNow,
                    enabled = !hostActionBusy,
                    colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = Color.White),
                    modifier = Modifier.padding(top = Spacing.md).fillMaxWidth().widthIn(max = 360.dp).heightIn(min = 48.dp),
                ) {
                    if (hostActionBusy) {
                        CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.live_scheduled_start_now))
                    }
                }
                TextButton(onClick = { confirmCancel = true }, enabled = !hostActionBusy, modifier = Modifier.padding(top = Spacing.xs)) {
                    Text(stringResource(R.string.live_scheduled_cancel_room), color = ZrpRed)
                }
                if (hostActionError != null) {
                    Text(text = hostActionError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
                }
            } else {
                Text(
                    text = stringResource(if (reminder.isSet) R.string.live_reminder_set_desc else R.string.live_scheduled_not_started),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.xl),
                )
                if (reminder.isSet) {
                    OutlinedButton(
                        onClick = { onSetReminder(false) },
                        enabled = !reminder.busy,
                        modifier = Modifier.padding(top = Spacing.md).heightIn(min = 48.dp),
                    ) {
                        Icon(Icons.Filled.NotificationsOff, contentDescription = null, modifier = Modifier.size(IconSize.sm))
                        Text(stringResource(R.string.live_reminder_cancel), modifier = Modifier.padding(start = Spacing.sm))
                    }
                } else {
                    Button(
                        onClick = { onSetReminder(true) },
                        enabled = !reminder.busy,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = Color.White),
                        modifier = Modifier.padding(top = Spacing.md).heightIn(min = 48.dp),
                    ) {
                        if (reminder.busy) {
                            CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Filled.Notifications, contentDescription = null, modifier = Modifier.size(IconSize.sm))
                            Text(stringResource(R.string.live_remind_me), modifier = Modifier.padding(start = Spacing.sm))
                        }
                    }
                }
                val reminderError = liveErrorText(reminder.error)
                if (reminderError != null) {
                    Text(
                        text = reminderError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }
                TextButton(onClick = onCheckAgain, modifier = Modifier.padding(top = Spacing.sm)) {
                    Text(stringResource(R.string.live_scheduled_check_again))
                }
            }
        }
    }

    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text(stringResource(R.string.live_scheduled_cancel_confirm_title)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmCancel = false
                    onCancelRoom()
                }) { Text(stringResource(R.string.live_scheduled_cancel_room), color = ZrpRed) }
            },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}
