package one.zrp.social.mobile.ui.creator

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CreatorRepository
import one.zrp.social.mobile.network.CreatorAudienceDay
import one.zrp.social.mobile.network.CreatorEngagementDay
import one.zrp.social.mobile.network.CreatorPremiumPost
import one.zrp.social.mobile.network.CreatorTip
import one.zrp.social.mobile.network.CreatorTopPost
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount

/**
 * ZRP Creator Studio - ported from dashboard/page.tsx (earnings
 * overview + monetisation settings + withdraw) and
 * ContentPerformanceTab.tsx/AudienceGrowthTab.tsx. See CreatorApi's
 * own KDoc for the full real contract, and CreatorViewModel's for why
 * this calls GET /api/creator/profile before dashboard/studio rather
 * than racing all three the way the website's own useEffect does.
 *
 * Two of the website's own affordances are deliberately not
 * reproduced here, both dead ends on native: the ineligible screen's
 * "Upgrade Plan" button (routes to /pricing - a crypto plan-upgrade
 * flow this app has never implemented, see native-payment-policy.ts)
 * and its "Go to Settings" button, plus the loaded screen's own
 * "Settings" button (this screen is only ever reached from within
 * Settings already, so the back arrow already covers that trip).
 *
 * [onOpenPost] (a top post's own row on the Content tab, matching
 * ContentPerformanceTab.tsx's own `<Link href={`/post/${post.id}`}>`)
 * routes to that post's real comments screen rather than a standalone
 * post-detail view - this app has never had a dedicated single-post
 * screen (posts are only ever shown inline in a feed), and building
 * one is out of scope here; the comments screen is the closest real,
 * reachable per-post destination that already exists.
 */
@Composable
fun CreatorScreen(onBack: () -> Unit, onOpenPost: (String) -> Unit) {
    val viewModel: CreatorViewModel = viewModel(
        factory = remember { CreatorViewModelFactory(CreatorRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                // Matches SettingsScreen's own back button - a plain,
                // untranslated "Back" content description, same as every
                // other Settings sub-screen this one is reached from.
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(text = stringResource(R.string.creator_studio_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.creator_studio_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            !state.isEligible -> IneligibleBody(message = state.ineligibleMessage)
            state.loadError != null -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = state.loadError ?: stringResource(R.string.creator_err_failed_load_dashboard),
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
            else -> {
                val tabIndex = when (state.activeTab) {
                    CreatorTab.OVERVIEW -> 0
                    CreatorTab.CONTENT -> 1
                    CreatorTab.AUDIENCE -> 2
                }
                TabRow(selectedTabIndex = tabIndex) {
                    Tab(
                        selected = tabIndex == 0,
                        onClick = { viewModel.setTab(CreatorTab.OVERVIEW) },
                        text = { Text(stringResource(R.string.creator_tab_overview)) },
                    )
                    Tab(
                        selected = tabIndex == 1,
                        onClick = { viewModel.setTab(CreatorTab.CONTENT) },
                        text = { Text(stringResource(R.string.creator_tab_content)) },
                    )
                    Tab(
                        selected = tabIndex == 2,
                        onClick = { viewModel.setTab(CreatorTab.AUDIENCE) },
                        text = { Text(stringResource(R.string.creator_tab_audience)) },
                    )
                }

                when (state.activeTab) {
                    CreatorTab.OVERVIEW -> OverviewTab(state = state, viewModel = viewModel)
                    CreatorTab.CONTENT -> ContentTab(state = state, onOpenPost = onOpenPost)
                    CreatorTab.AUDIENCE -> AudienceTab(state = state)
                }
            }
        }
    }

    if (state.showWithdrawDialog) {
        WithdrawDialog(state = state, viewModel = viewModel)
    }
}

@Composable
private fun IneligibleBody(message: String?) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = stringResource(R.string.creator_monetisation_title), style = MaterialTheme.typography.titleLarge)
        if (message != null) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

@Composable
private fun OverviewTab(state: CreatorUiState, viewModel: CreatorViewModel) {
    val profile = state.profile ?: return
    val stats = state.stats

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.lg),
    ) {
        item {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.height(180.dp),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                item {
                    StatCard(stringResource(R.string.creator_stat_balance), formatCreatorUsd(stats?.balance ?: profile.balance), Icons.Filled.AccountBalanceWallet)
                }
                item {
                    StatCard(stringResource(R.string.creator_stat_total_tips), formatCreatorUsd(stats?.totalTips ?: profile.totalTips), Icons.Filled.Favorite)
                }
                item {
                    StatCard(stringResource(R.string.creator_stat_premium_revenue), formatCreatorUsd(stats?.totalPremiumRevenue ?: profile.totalPremiumRevenue), Icons.Filled.ShoppingBag)
                }
                item {
                    StatCard(stringResource(R.string.creator_stat_withdrawn), formatCreatorUsd(stats?.totalWithdrawn ?: profile.totalWithdrawn), Icons.Filled.TrendingUp)
                }
            }
        }

        item {
            Button(
                onClick = viewModel::openWithdrawDialog,
                enabled = profile.balance > 0,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(text = stringResource(R.string.creator_withdraw_button), modifier = Modifier.padding(start = Spacing.sm))
            }
        }

        item {
            Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp) {
                Column(modifier = Modifier.padding(Spacing.md)) {
                    Text(text = stringResource(R.string.creator_monetisation_settings_title), style = MaterialTheme.typography.titleSmall)
                    Text(
                        text = stringResource(R.string.creator_monetisation_settings_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp, bottom = Spacing.sm),
                    )
                    SettingsToggleRow(
                        label = stringResource(R.string.creator_tips_label),
                        checked = profile.tipsEnabled,
                        onCheckedChange = viewModel::setTipsEnabled,
                    )
                    SettingsToggleRow(
                        label = stringResource(R.string.creator_premium_posts_label),
                        checked = profile.premiumPostsEnabled,
                        onCheckedChange = viewModel::setPremiumPostsEnabled,
                    )
                    val settingsError = state.settingsError
                    if (settingsError != null) {
                        Text(
                            text = settingsError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier
                                .padding(top = Spacing.xs)
                                .clickable { viewModel.dismissSettingsError() },
                        )
                    }
                }
            }
        }

        item {
            Text(text = stringResource(R.string.creator_recent_tips_title), style = MaterialTheme.typography.titleSmall)
        }
        if (state.recentTips.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.creator_no_tips_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.lg),
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            items(state.recentTips, key = { it.id }) { tip -> TipRow(tip) }
        }

        item {
            Text(text = stringResource(R.string.creator_premium_posts_label), style = MaterialTheme.typography.titleSmall)
        }
        if (state.premiumPosts.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.creator_no_premium_posts_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.lg),
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            items(state.premiumPosts, key = { it.id }) { pp -> PremiumPostRow(pp) }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, icon: ImageVector) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
            Text(text = value, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = Spacing.xs))
        }
    }
}

@Composable
private fun SettingsToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun TipRow(tip: CreatorTip) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = tip.sender.avatarUrl, name = tip.sender.name ?: tip.sender.username, size = 32.dp)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
            Text(text = tip.sender.name ?: tip.sender.username, style = MaterialTheme.typography.bodyMedium)
            if (!tip.message.isNullOrBlank()) {
                Text(text = tip.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(text = formatCreatorDate(tip.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(text = formatCreatorUsd(tip.amount), color = Color(0xFF15803D), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PremiumPostRow(pp: CreatorPremiumPost) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Text(text = pp.post.content, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(shape = RoundedCornerShape(50), color = Color(0xFFF3E8FF)) {
                    Text(
                        text = formatCreatorUsd(pp.price),
                        color = Color(0xFF7E22CE),
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = Spacing.sm, vertical = 2.dp),
                    )
                }
                val countRes = if (pp.totalPurchases == 1) R.string.creator_purchase_count_singular else R.string.creator_purchase_count_plural
                Text(
                    text = stringResource(countRes, pp.totalPurchases),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ContentTab(state: CreatorUiState, onOpenPost: (String) -> Unit) {
    when {
        state.studioLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        state.studioError || state.content == null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.creator_failed_load_content), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        else -> {
            val content = state.content
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            ) {
                item {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.height(180.dp),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                    ) {
                        item { StatCard(stringResource(R.string.creator_content_views), formatCount(content.totals.views), Icons.Filled.Visibility) }
                        item { StatCard(stringResource(R.string.creator_content_likes), formatCount(content.totals.likes), Icons.Filled.Favorite) }
                        item { StatCard(stringResource(R.string.creator_content_comments), formatCount(content.totals.comments), Icons.Filled.ChatBubbleOutline) }
                        item { StatCard(stringResource(R.string.creator_content_reposts), formatCount(content.totals.reposts), Icons.Filled.Repeat) }
                    }
                }

                item {
                    Column {
                        Text(text = stringResource(R.string.creator_content_engagement_title), style = MaterialTheme.typography.titleSmall)
                        Text(
                            text = stringResource(R.string.creator_content_engagement_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = Spacing.sm),
                        )
                        EngagementBarChart(content.engagementTrend)
                        if (content.engagementTrend.isNotEmpty()) {
                            Row(modifier = Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(content.engagementTrend.first().date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(content.engagementTrend.last().date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                item {
                    Text(text = stringResource(R.string.creator_content_top_posts_title), style = MaterialTheme.typography.titleSmall)
                }
                if (content.topPosts.isEmpty()) {
                    item {
                        Text(
                            text = stringResource(R.string.creator_content_no_posts_yet),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.lg),
                            textAlign = TextAlign.Center,
                        )
                    }
                } else {
                    itemsIndexed(content.topPosts, key = { _, post -> post.id }) { index, post ->
                        TopPostRow(index + 1, post, onOpenPost)
                    }
                }
            }
        }
    }
}

@Composable
private fun TopPostRow(rank: Int, post: CreatorTopPost, onOpenPost: (String) -> Unit) {
    val fallback = stringResource(R.string.creator_content_media_post_fallback)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable { onOpenPost(post.id) }
            .padding(Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = rank.toString(), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(24.dp), textAlign = TextAlign.Center)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
            Text(text = post.content.ifBlank { fallback }, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
            Row(modifier = Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                MiniStat(Icons.Filled.Visibility, formatCount(post.views))
                MiniStat(Icons.Filled.Favorite, formatCount(post._count.likes))
                MiniStat(Icons.Filled.ChatBubbleOutline, formatCount(post._count.comments))
                MiniStat(Icons.Filled.Repeat, formatCount(post._count.reposts))
            }
        }
    }
}

@Composable
private fun MiniStat(icon: ImageVector, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 2.dp))
    }
}

@Composable
private fun EngagementBarChart(trend: List<CreatorEngagementDay>) {
    val maxDay = (trend.maxOfOrNull { it.total } ?: 0).coerceAtLeast(1)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp),
        horizontalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        trend.forEach { day ->
            val fraction = (day.total.toFloat() / maxDay).coerceIn(0.02f, 1f)
            val labelRes = if (day.total == 1) R.string.creator_content_engagement_tooltip_singular else R.string.creator_content_engagement_tooltip_plural
            val label = stringResource(labelRes, day.date, day.total)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(fraction)
                    .clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))
                    .background(ZrpRed.copy(alpha = 0.7f))
                    .semantics { contentDescription = label },
            )
        }
    }
}

@Composable
private fun AudienceTab(state: CreatorUiState) {
    when {
        state.studioLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        state.studioError || state.audience == null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.creator_failed_load_audience), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        else -> {
            val audience = state.audience
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            ) {
                Row(modifier = Modifier.fillMaxWidth().height(90.dp), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Box(Modifier.weight(1f)) { StatCard(stringResource(R.string.creator_audience_total_followers), audience.totalFollowers.toString(), Icons.Filled.Groups) }
                    Box(Modifier.weight(1f)) {
                        val sign = if (audience.newFollowersInWindow > 0) "+" else ""
                        StatCard(stringResource(R.string.creator_audience_new_last_30_days), "$sign${audience.newFollowersInWindow}", Icons.Filled.PersonAdd)
                    }
                }

                Column {
                    Text(text = stringResource(R.string.creator_audience_follower_growth_title), style = MaterialTheme.typography.titleSmall)
                    Text(
                        text = stringResource(R.string.creator_audience_follower_growth_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = Spacing.sm),
                    )
                    FollowerLineChart(audience.trend)
                    if (audience.trend.isNotEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(audience.trend.first().date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(audience.trend.last().date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                Column {
                    Text(text = stringResource(R.string.creator_audience_new_followers_per_day_title), style = MaterialTheme.typography.titleSmall)
                    DailyFollowersBarChart(audience.trend, modifier = Modifier.padding(top = Spacing.sm))
                }
            }
        }
    }
}

@Composable
private fun FollowerLineChart(trend: List<CreatorAudienceDay>) {
    val lineColor = ZrpRed
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp),
    ) {
        if (trend.size < 2) return@Canvas
        val minTotal = trend.minOf { it.totalFollowers }
        val maxTotal = trend.maxOf { it.totalFollowers }.coerceAtLeast(1)
        val range = (maxTotal - minTotal).coerceAtLeast(1)
        val stepX = size.width / (trend.size - 1)
        val points = trend.mapIndexed { index, day ->
            val y = size.height - ((day.totalFollowers - minTotal).toFloat() / range) * (size.height * 0.9f) - (size.height * 0.05f)
            Offset(index * stepX, y)
        }
        for (i in 0 until points.size - 1) {
            drawLine(color = lineColor, start = points[i], end = points[i + 1], strokeWidth = 4f)
        }
    }
}

@Composable
private fun DailyFollowersBarChart(trend: List<CreatorAudienceDay>, modifier: Modifier = Modifier) {
    val maxNew = (trend.maxOfOrNull { it.newFollowers } ?: 0).coerceAtLeast(1)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp),
        horizontalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        trend.forEach { day ->
            val fraction = if (day.newFollowers == 0) 0.03f else (day.newFollowers.toFloat() / maxNew).coerceIn(0.06f, 1f)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(fraction)
                    .clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))
                    .background(ZrpRed.copy(alpha = 0.7f))
                    .semantics { contentDescription = "${day.date}: +${day.newFollowers}" },
            )
        }
    }
}

@Composable
private fun WithdrawDialog(state: CreatorUiState, viewModel: CreatorViewModel) {
    Dialog(
        onDismissRequest = viewModel::closeWithdrawDialog,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.padding(24.dp),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(modifier = Modifier.padding(Spacing.lg)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = stringResource(R.string.creator_withdraw_funds_title), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = viewModel::closeWithdrawDialog, enabled = !state.isWithdrawing) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.action_cancel))
                    }
                }

                OutlinedTextField(
                    value = state.withdrawAmount,
                    onValueChange = viewModel::onWithdrawAmountChange,
                    label = { Text(stringResource(R.string.creator_amount_usdc_label)) },
                    placeholder = { Text(stringResource(R.string.creator_enter_amount_placeholder)) },
                    enabled = !state.isWithdrawing,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.creator_available_balance, formatCreatorUsd(state.profile?.balance ?: 0.0)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )

                OutlinedTextField(
                    value = state.withdrawWalletAddress,
                    onValueChange = viewModel::onWithdrawWalletChange,
                    label = { Text(stringResource(R.string.creator_solana_wallet_label)) },
                    placeholder = { Text(stringResource(R.string.creator_enter_wallet_placeholder)) },
                    enabled = !state.isWithdrawing,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                )

                val error = state.withdrawError
                if (error != null) {
                    Text(
                        text = withdrawErrorMessage(error),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Button(
                        onClick = viewModel::submitWithdraw,
                        enabled = !state.isWithdrawing,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    ) {
                        if (state.isWithdrawing) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                            Text(text = stringResource(R.string.creator_processing), modifier = Modifier.padding(start = Spacing.sm))
                        } else {
                            Text(stringResource(R.string.creator_withdraw_button))
                        }
                    }
                }

                Text(
                    text = stringResource(R.string.creator_withdrawals_processed_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
            }
        }
    }
}

@Composable
private fun withdrawErrorMessage(error: CreatorWithdrawError): String = when (error) {
    CreatorWithdrawError.InvalidAmount -> stringResource(R.string.creator_err_invalid_amount)
    CreatorWithdrawError.InvalidWallet -> stringResource(R.string.creator_err_invalid_wallet)
    CreatorWithdrawError.InsufficientBalance -> stringResource(R.string.creator_err_insufficient_balance)
    is CreatorWithdrawError.ServerError -> error.detail
}
