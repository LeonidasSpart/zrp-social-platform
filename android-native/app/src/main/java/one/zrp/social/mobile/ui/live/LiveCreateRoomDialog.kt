package one.zrp.social.mobile.ui.live

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.format.DateFormat
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError
import java.util.Calendar

/**
 * "Go live" form shared by Live Audio and Live Video (both POST /rooms
 * accept the exact same body - title, description, category,
 * visibility, communityId, scheduledAt). Extracted unchanged from Live
 * Audio's original dialog, plus an optional "Schedule for later" that
 * sends a future scheduledAt - the room is then created SCHEDULED, and
 * the room screen offers the host "Start now"/share and everyone else a
 * reminder.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveCreateRoomDialog(
    isSubmitting: Boolean,
    error: String?,
    myCommunities: List<CommunitySummary>,
    onDismiss: () -> Unit,
    onSubmit: (title: String, description: String?, category: String?, visibility: String, communityId: String?, scheduledAtMillis: Long?) -> Unit,
) {
    val context = LocalContext.current
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("PUBLIC") }
    var communityId by remember { mutableStateOf<String?>(null) }
    var communityMenuExpanded by remember { mutableStateOf(false) }
    var scheduleForLater by remember { mutableStateOf(false) }
    // Default suggestion: the next whole hour at least an hour away.
    var scheduledAtMillis by remember {
        mutableStateOf(
            Calendar.getInstance().apply {
                add(Calendar.HOUR_OF_DAY, 1)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis,
        )
    }

    val visibilityOptions = listOf(
        "PUBLIC" to stringResource(R.string.live_audio_visibility_public),
        "COMMUNITY" to stringResource(R.string.live_audio_visibility_community),
        "PRIVATE" to stringResource(R.string.live_audio_visibility_private),
    )
    val scheduleValid = !scheduleForLater || isValidScheduleTime(scheduledAtMillis, System.currentTimeMillis())
    val canSubmit = title.trim().isNotEmpty() && title.trim().length <= 200 && !isSubmitting &&
        (visibility != "COMMUNITY" || communityId != null) && scheduleValid

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.live_audio_create_title)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                if (error != null) {
                    Text(
                        text = localizedError(error) ?: "",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = Spacing.sm),
                    )
                }
                OutlinedTextField(
                    value = title,
                    onValueChange = { if (it.length <= 200) title = it },
                    label = { Text(stringResource(R.string.live_audio_title_label)) },
                    placeholder = { Text(stringResource(R.string.live_audio_title_placeholder)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { if (it.length <= 2000) description = it },
                    label = { Text(stringResource(R.string.live_audio_description_label)) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { if (it.length <= 60) category = it },
                    label = { Text(stringResource(R.string.live_audio_category_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.live_audio_visibility_label),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    visibilityOptions.forEach { (value, label) ->
                        val selected = visibility == value
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .border(
                                    width = 1.dp,
                                    color = if (selected) ZrpRed else MaterialTheme.colorScheme.outline,
                                    shape = RoundedCornerShape(12.dp),
                                )
                                .background(if (selected) ZrpRed else MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
                                .clickable { visibility = value }
                                .padding(vertical = Spacing.sm),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
                if (visibility == "COMMUNITY") {
                    if (myCommunities.isEmpty()) {
                        Text(
                            text = stringResource(R.string.live_audio_no_communities_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    } else {
                        ExposedDropdownMenuBox(
                            expanded = communityMenuExpanded,
                            onExpandedChange = { communityMenuExpanded = it },
                            modifier = Modifier.padding(top = Spacing.sm),
                        ) {
                            OutlinedTextField(
                                value = myCommunities.firstOrNull { it.id == communityId }?.name
                                    ?: stringResource(R.string.live_audio_select_community_placeholder),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(stringResource(R.string.live_audio_community_label)) },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = communityMenuExpanded) },
                                modifier = Modifier.menuAnchor().fillMaxWidth(),
                            )
                            DropdownMenu(expanded = communityMenuExpanded, onDismissRequest = { communityMenuExpanded = false }) {
                                myCommunities.forEach { community ->
                                    DropdownMenuItem(
                                        text = { Text(community.name) },
                                        onClick = {
                                            communityId = community.id
                                            communityMenuExpanded = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                ) {
                    Text(
                        text = stringResource(R.string.live_create_schedule_toggle),
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = scheduleForLater, onCheckedChange = { scheduleForLater = it })
                }
                if (scheduleForLater) {
                    val dateLabel = DateUtils.formatDateTime(
                        context,
                        scheduledAtMillis,
                        DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_WEEKDAY or DateUtils.FORMAT_ABBREV_ALL,
                    )
                    val timeLabel = DateUtils.formatDateTime(context, scheduledAtMillis, DateUtils.FORMAT_SHOW_TIME)
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.padding(top = Spacing.xs)) {
                        OutlinedButton(
                            onClick = {
                                val cal = Calendar.getInstance().apply { timeInMillis = scheduledAtMillis }
                                DatePickerDialog(
                                    context,
                                    { _, year, month, day ->
                                        cal.set(Calendar.YEAR, year)
                                        cal.set(Calendar.MONTH, month)
                                        cal.set(Calendar.DAY_OF_MONTH, day)
                                        scheduledAtMillis = cal.timeInMillis
                                    },
                                    cal.get(Calendar.YEAR),
                                    cal.get(Calendar.MONTH),
                                    cal.get(Calendar.DAY_OF_MONTH),
                                ).apply { datePicker.minDate = System.currentTimeMillis() - 1_000L }.show()
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(dateLabel, maxLines = 1)
                        }
                        OutlinedButton(
                            onClick = {
                                val cal = Calendar.getInstance().apply { timeInMillis = scheduledAtMillis }
                                TimePickerDialog(
                                    context,
                                    { _, hour, minute ->
                                        cal.set(Calendar.HOUR_OF_DAY, hour)
                                        cal.set(Calendar.MINUTE, minute)
                                        cal.set(Calendar.SECOND, 0)
                                        cal.set(Calendar.MILLISECOND, 0)
                                        scheduledAtMillis = cal.timeInMillis
                                    },
                                    cal.get(Calendar.HOUR_OF_DAY),
                                    cal.get(Calendar.MINUTE),
                                    DateFormat.is24HourFormat(context),
                                ).show()
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(timeLabel, maxLines = 1)
                        }
                    }
                    if (!scheduleValid) {
                        Text(
                            text = stringResource(R.string.live_create_schedule_past),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(
                    onClick = {
                        onSubmit(
                            title,
                            description.trim().ifEmpty { null },
                            category.trim().ifEmpty { null },
                            visibility,
                            if (visibility == "COMMUNITY") communityId else null,
                            if (scheduleForLater) scheduledAtMillis else null,
                        )
                    },
                    enabled = canSubmit,
                ) {
                    Text(stringResource(if (scheduleForLater) R.string.live_create_schedule_submit else R.string.live_audio_create_submit))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
