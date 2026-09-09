package one.zrp.social.mobile.ui.admin

import android.widget.Toast
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor
import kotlin.math.max
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminAnalyticsDaily
import one.zrp.social.mobile.network.AdminAnalyticsTopPost
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private val dailyDateFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/**
 * Ported from src/app/admin/analytics/page.tsx - see
 * AdminAnalyticsViewModel's own KDoc for what the route returns and
 * when it fails.
 *
 * The website renders the same payload through recharts (line, bar and
 * pie). Nothing equivalent ships here: this app has no charting
 * dependency and doesn't gain one for this screen, matching the
 * precedent set by the Profile Analytics tab, which renders the same
 * kind of totals as plain stat cards. The one visual is the daily
 * series, drawn as a compact Canvas bar chart - a handful of drawRect
 * calls over the values the route already returned, with the series it
 * plots named underneath so a bar is never mistaken for a total.
 */
@Composable
fun AdminAnalyticsScreen(onBack: () -> Unit) {
    val viewModel: AdminAnalyticsViewModel = viewModel(
        factory = remember { AdminAnalyticsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            viewModel.consumeError()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.admin_analytics_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        val analytics = state.analytics
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            analytics == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.admin_analytics_failed),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(Spacing.lg),
                    )
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(Spacing.lg),
                ) {
                    Text(
                        text = stringResource(R.string.admin_analytics_last_30_days),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = Spacing.md),
                    )

                    val summary = analytics.summary
                    val engagement = analytics.engagement
                    AnalyticsCardGrid(
                        listOf(
                            stringResource(R.string.admin_analytics_users) to summary.users.toString(),
                            stringResource(R.string.admin_analytics_posts) to summary.posts.toString(),
                            stringResource(R.string.admin_analytics_comments) to summary.comments.toString(),
                            stringResource(R.string.admin_analytics_likes) to summary.likes.toString(),
                            stringResource(R.string.admin_analytics_reposts) to summary.reposts.toString(),
                        ),
                    )

                    AnalyticsSectionTitle(stringResource(R.string.admin_analytics_engagement_breakdown))
                    AnalyticsCardGrid(
                        listOf(
                            stringResource(R.string.admin_analytics_avg_likes_per_post) to
                                formatAverage(engagement.avgLikesPerPost),
                            stringResource(R.string.admin_analytics_avg_comments_per_post) to
                                formatAverage(engagement.avgCommentsPerPost),
                            stringResource(R.string.admin_analytics_total_posts) to engagement.totalPosts.toString(),
                            stringResource(R.string.admin_analytics_total_likes) to engagement.totalLikes.toString(),
                            stringResource(R.string.admin_analytics_total_comments) to
                                engagement.totalComments.toString(),
                        ),
                    )

                    AnalyticsSectionTitle(stringResource(R.string.admin_analytics_daily_activity))
                    DailyActivityChart(analytics.daily)

                    AnalyticsSectionTitle(stringResource(R.string.admin_analytics_top_posts))
                    if (analytics.topPosts.isEmpty()) {
                        Text(
                            text = stringResource(R.string.admin_analytics_no_top_posts),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        analytics.topPosts.forEachIndexed { index, post ->
                            TopPostRow(rank = index + 1, post = post)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AnalyticsSectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = Spacing.xl, bottom = Spacing.md),
    )
}

/**
 * A real (non-lazy) two-per-row grid, for the same reason
 * AdminDashboardScreen's stat grid is one: this screen already lives
 * inside a verticalScroll Column, and a Lazy* layout nested in one is
 * measured with an unbounded max height, which Compose crashes on. The
 * card lists here are short and fixed-size, so nothing is lost.
 */
@Composable
private fun AnalyticsCardGrid(cards: List<Pair<String, String>>) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        cards.chunked(2).forEach { rowCards ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                modifier = Modifier.fillMaxWidth(),
            ) {
                rowCards.forEach { (label, value) ->
                    Box(modifier = Modifier.weight(1f)) {
                        AnalyticsStatCard(label = label, value = value)
                    }
                }
                if (rowCards.size < 2) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun AnalyticsStatCard(label: String, value: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(text = value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = ZrpRed)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

/**
 * The route's own daily series, one bar per day it returned. Each
 * day's users/posts/comments/likes/reposts counts are genuinely
 * independent (see AdminAnalyticsDaily), but this chart only plots
 * `posts` and says so underneath, rather than trying to cram all five
 * series into one bar - the website's own recharts view spreads them
 * across separate line/bar/pie charts, which this screen doesn't have
 * an equivalent for.
 */
@Composable
private fun DailyActivityChart(daily: List<AdminAnalyticsDaily>) {
    if (daily.isEmpty()) {
        Text(
            text = stringResource(R.string.admin_analytics_no_daily),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    val peak = daily.maxByOrNull { it.posts }
    val peakValue = peak?.posts ?: 0L

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Canvas(modifier = Modifier.fillMaxWidth().height(120.dp)) {
            // max(1) keeps the divisor safe on an all-zero series; the
            // bars then simply render at zero height.
            val maxValue = max(peakValue, 1L).toFloat()
            val slot = size.width / daily.size
            val barWidth = (slot * 0.7f).coerceAtLeast(1f)
            daily.forEachIndexed { index, day ->
                val barHeight = (day.posts / maxValue) * size.height
                drawRect(
                    color = ZrpRed,
                    topLeft = Offset(x = index * slot + (slot - barWidth) / 2f, y = size.height - barHeight),
                    size = Size(width = barWidth, height = barHeight),
                )
            }
        }

        Text(
            text = stringResource(R.string.admin_analytics_posts),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        Text(
            text = stringResource(
                R.string.admin_analytics_daily_range,
                formatDailyDate(daily.first().date),
                formatDailyDate(daily.last().date),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (peak != null) {
            Text(
                text = stringResource(
                    R.string.admin_analytics_daily_peak,
                    peakValue.toString(),
                    formatDailyDate(peak.date),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TopPostRow(rank: Int, post: AdminAnalyticsTopPost) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Spacing.sm)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#$rank",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f).padding(horizontal = Spacing.sm)) {
            Text(
                text = post.content,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(
                    R.string.admin_analytics_post_counts,
                    "@${post.author.username}",
                    post._count.likes.toString(),
                    post._count.comments.toString(),
                    post._count.reposts.toString(),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text(
            text = post.engagement.toString(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = ZrpRed,
        )
    }
}

/**
 * Matches the website's own `parseFloat(x.toFixed(1))` averages: an
 * average that lands on a whole number renders without a stray ".0",
 * anything else keeps its single decimal.
 */
private fun formatAverage(value: Double): String =
    if (value == floor(value)) value.toInt().toString()
    else "%.1f".format(Locale.getDefault(), value)

/**
 * The daily series' `date` is a serialised SQL DATE, i.e. a full
 * ISO-8601 timestamp. Formatted short and locale-aware, the same as
 * the website's own toLocaleDateString on it. An unparseable value
 * falls back to the raw string rather than being dropped.
 */
private fun formatDailyDate(iso: String): String {
    val date = try { dailyDateFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return iso
    return DateFormat.getDateInstance(DateFormat.SHORT, Locale.getDefault()).format(date)
}
