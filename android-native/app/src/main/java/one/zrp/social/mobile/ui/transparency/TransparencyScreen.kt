package one.zrp.social.mobile.ui.transparency

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import kotlin.math.max
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.TransparencyRepository
import one.zrp.social.mobile.network.ModerationTransparencyResponse
import one.zrp.social.mobile.network.TransparencyActionCount
import one.zrp.social.mobile.network.TransparencyReasonCount
import one.zrp.social.mobile.network.TransparencySeriesPoint
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpSilver
import one.zrp.social.mobile.util.parseIsoMillis
import java.text.DateFormat
import java.util.Date

private fun reasonLabelRes(reason: String): Int = when (reason) {
    "Spam" -> R.string.report_reason_spam
    "Harassment or bullying" -> R.string.report_reason_harassment
    "Inappropriate content" -> R.string.report_reason_inappropriate
    "Misinformation" -> R.string.report_reason_misinformation
    "Hate speech" -> R.string.report_reason_hate_speech
    "Impersonation" -> R.string.report_reason_impersonation
    else -> R.string.report_reason_other
}

private fun statusLabelRes(status: String): Int = when (status) {
    "pending" -> R.string.admin_reports_status_pending
    "reviewed" -> R.string.admin_reports_status_reviewed
    "dismissed" -> R.string.admin_reports_status_dismissed
    else -> R.string.admin_reports_status_actioned
}

private fun actionLabelRes(actionType: String): Int = when (actionType) {
    "DELETE_POST" -> R.string.admin_reports_action_delete_post
    "WARN_USER" -> R.string.admin_reports_action_warn_user
    "BAN_USER" -> R.string.admin_reports_action_ban_user
    "MUTE_USER" -> R.string.admin_reports_action_mute_user
    "DELETE_COMMENT" -> R.string.admin_reports_action_delete_comment
    else -> R.string.admin_reports_action_other
}

private fun formatMonth(month: String): String {
    val parts = month.split("-")
    if (parts.size != 2) return month
    val monthIndex = (parts[1].toIntOrNull() ?: 1) - 1
    val months = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    val short = parts[0].takeLast(2)
    return "${months.getOrElse(monthIndex) { "" }} '$short"
}

private fun formatGeneratedDate(iso: String): String {
    val millis = parseIsoMillis(iso) ?: return ""
    return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault()).format(Date(millis))
}

/**
 * Ported from src/app/transparency/page.tsx - the public moderation
 * transparency dashboard. See TransparencyApi's own KDoc for the real
 * contract (public, no auth, aggregate counts only - never a
 * reporter's or reported user's identity, never post/comment content).
 *
 * The website renders its trend as a recharts LineChart and its action
 * breakdown as a recharts BarChart. This app has no charting
 * dependency and doesn't gain one for this screen, matching the
 * precedent set by AdminAnalyticsScreen: the trend is a grouped
 * Canvas bar chart (received vs. actioned per month, a legend
 * underneath rather than per-bar axis labels crowding 12 months into
 * one screen width), and the reason/action breakdowns are plain
 * horizontal progress bars.
 */
@Composable
fun TransparencyScreen(onBack: () -> Unit) {
    val viewModel: TransparencyViewModel = viewModel(
        factory = remember { TransparencyViewModelFactory(TransparencyRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.transparency_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.lg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.md)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .padding(Spacing.md),
            ) {
                Icon(
                    Icons.Filled.Info,
                    contentDescription = null,
                    tint = ZrpRed,
                    modifier = Modifier.padding(top = 2.dp).size(18.dp),
                )
                Text(
                    text = stringResource(R.string.transparency_privacy_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }

            when {
                state.isLoading -> Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xxl),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }
                state.data == null -> Text(
                    text = stringResource(R.string.transparency_err_load),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xxl),
                )
                else -> TransparencyBody(state.data!!)
            }

            Box(modifier = Modifier.height(Spacing.xxl))
        }
    }
}

@Composable
private fun TransparencyBody(data: ModerationTransparencyResponse) {
    Column(modifier = Modifier.padding(top = Spacing.lg)) {
        // Headline stats, 2x2.
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            StatTile(
                value = data.totals.allTime.toString(),
                label = stringResource(R.string.transparency_total_reports_label),
                modifier = Modifier.weight(1f),
            )
            StatTile(
                value = data.totals.last30Days.toString(),
                label = stringResource(R.string.transparency_last_30_days_label),
                modifier = Modifier.weight(1f),
            )
        }
        Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            val actioned = data.byStatus.find { it.status == "actioned" }?.count ?: 0
            StatTile(
                value = actioned.toString(),
                label = stringResource(R.string.transparency_actions_taken_label),
                modifier = Modifier.weight(1f),
            )
            val resolution = data.medianResolutionHours
            val resolutionText = when {
                resolution == null -> "-"
                resolution < 24 -> stringResource(R.string.transparency_hours_value, Math.round(resolution).toInt())
                else -> stringResource(R.string.transparency_days_value, Math.round(resolution / 24).toInt())
            }
            StatTile(
                value = resolutionText,
                label = stringResource(R.string.transparency_median_resolution_label),
                modifier = Modifier.weight(1f),
            )
        }

        // Trend chart.
        SectionHeading(stringResource(R.string.transparency_trend_heading))
        TrendChart(data.series)

        // Reason breakdown.
        SectionHeading(stringResource(R.string.transparency_reason_heading))
        val maxReason = max(1L, data.byReason.maxOfOrNull { it.count } ?: 1L)
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            data.byReason.forEach { r -> ReasonRow(r, maxReason) }
        }

        // Status breakdown.
        SectionHeading(stringResource(R.string.transparency_status_heading))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            data.byStatus.take(2).forEach { s ->
                StatTile(value = s.count.toString(), label = stringResource(statusLabelRes(s.status)), modifier = Modifier.weight(1f))
            }
        }
        Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            data.byStatus.drop(2).forEach { s ->
                StatTile(value = s.count.toString(), label = stringResource(statusLabelRes(s.status)), modifier = Modifier.weight(1f))
            }
        }

        // Action breakdown.
        SectionHeading(stringResource(R.string.transparency_action_heading))
        val maxAction = max(1L, data.byActionType.maxOfOrNull { it.count } ?: 1L)
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            data.byActionType.forEach { a -> ActionRow(a, maxAction) }
        }

        // Appeals.
        SectionHeading(stringResource(R.string.transparency_appeals_heading))
        Text(
            text = stringResource(R.string.transparency_appeals_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.sm),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            StatTile(value = data.appeals.pending.toString(), label = stringResource(R.string.appeals_status_pending), modifier = Modifier.weight(1f))
            StatTile(value = data.appeals.upheld.toString(), label = stringResource(R.string.appeals_status_upheld), modifier = Modifier.weight(1f))
            StatTile(value = data.appeals.overturned.toString(), label = stringResource(R.string.appeals_status_overturned), modifier = Modifier.weight(1f))
        }

        Text(
            text = stringResource(R.string.transparency_generated_note, formatGeneratedDate(data.generatedAt)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        )
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl, bottom = Spacing.md),
    )
}

@Composable
private fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = modifier) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = ZrpRed)
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.xs),
            )
        }
    }
}

@Composable
private fun ReasonRow(entry: TransparencyReasonCount, maxCount: Long) {
    LabeledBar(label = stringResource(reasonLabelRes(entry.reason)), count = entry.count, maxCount = maxCount)
}

@Composable
private fun ActionRow(entry: TransparencyActionCount, maxCount: Long) {
    LabeledBar(label = stringResource(actionLabelRes(entry.actionType)), count = entry.count, maxCount = maxCount)
}

@Composable
private fun LabeledBar(label: String, count: Long, maxCount: Long) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(120.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(10.dp)
                .clip(RoundedCornerShape(5.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHighest),
        ) {
            val fraction = (count.toFloat() / maxCount.toFloat()).coerceIn(0f, 1f)
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(10.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(ZrpRed),
            )
        }
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(36.dp).padding(start = Spacing.sm),
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun TrendChart(series: List<TransparencySeriesPoint>) {
    if (series.isEmpty()) return

    val maxValue = max(1L, series.maxOf { max(it.received, it.actioned) }).toFloat()

    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Canvas(modifier = Modifier.fillMaxWidth().height(140.dp)) {
                val slot = size.width / series.size
                val barWidth = (slot * 0.32f).coerceAtLeast(1f)
                series.forEachIndexed { index, point ->
                    val receivedHeight = (point.received / maxValue) * size.height
                    val actionedHeight = (point.actioned / maxValue) * size.height
                    val baseX = index * slot + slot * 0.18f
                    drawRect(
                        color = ZrpSilver,
                        topLeft = Offset(x = baseX, y = size.height - receivedHeight),
                        size = Size(width = barWidth, height = receivedHeight),
                    )
                    drawRect(
                        color = ZrpRed,
                        topLeft = Offset(x = baseX + barWidth, y = size.height - actionedHeight),
                        size = Size(width = barWidth, height = actionedHeight),
                    )
                }
            }
            Text(
                text = "${formatMonth(series.first().month)} - ${formatMonth(series.last().month)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.sm),
            )
            Row(modifier = Modifier.padding(top = Spacing.xs)) {
                LegendDot(color = ZrpSilver, label = stringResource(R.string.transparency_legend_received))
                LegendDot(color = ZrpRed, label = stringResource(R.string.transparency_legend_actioned), modifier = Modifier.padding(start = Spacing.md))
            }
        }
    }
}

@Composable
private fun LegendDot(color: androidx.compose.ui.graphics.Color, label: String, modifier: Modifier = Modifier) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
        Box(modifier = Modifier.size(8.dp).clip(RoundedCornerShape(4.dp)).background(color))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = Spacing.xs),
        )
    }
}
