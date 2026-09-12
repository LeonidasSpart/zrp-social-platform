package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminNewsFeed
import one.zrp.social.mobile.network.AdminNewsPublication
import one.zrp.social.mobile.network.AdminNewsSource
import one.zrp.social.mobile.network.AdminNewsStory
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private val HealthyGreen = Color(0xFF15803D)
private val WarningAmber = Color(0xFFA16207)
private val MutedGrey = Color(0xFF6B7280)

/**
 * The native ZRP News Network console, ported from
 * src/app/admin/news-network/page.tsx - the automated editorial pipeline
 * (RSS ingestion, story clustering, per-language summaries, scheduled
 * publication from provisioned editorial accounts). Not the journalist
 * news CMS at /admin/news, which is a different feature entirely.
 *
 * One screen with the website's own five sections as tabs, because the
 * website itself is one page with one `Tab` state and every action reads
 * the same five loads - splitting it into five back-stack destinations
 * would make "act, then see the updated overview" a navigation round
 * trip rather than a tab tap.
 *
 * See AdminNewsNetworkViewModel's KDoc for the auth split (staff reads,
 * admin writes) and why every action here confirms first.
 */
@Composable
fun AdminNewsNetworkScreen(
    isAdmin: Boolean,
    onBack: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val viewModel: AdminNewsNetworkViewModel = viewModel(
        factory = remember { AdminNewsNetworkViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(isAdmin) { if (isAdmin) viewModel.load() }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            viewModel.consumeError()
        }
    }

    val messageText = state.message?.let { newsNetworkMessageText(it) }
    LaunchedEffect(state.message) {
        if (messageText != null) {
            Toast.makeText(context, messageText, Toast.LENGTH_LONG).show()
            viewModel.consumeMessage()
        }
    }

    // Which feed a picked image belongs to. The picker result arrives
    // long after the tap, so the target has to be remembered rather than
    // captured in the launcher.
    var imageFeedId by remember { mutableStateOf<String?>(null) }
    val avatarPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val feedId = imageFeedId
        if (uri != null && feedId != null) {
            viewModel.uploadFeedImage(feedId, context.contentResolver, uri, cover = false)
        }
        imageFeedId = null
    }
    val coverPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val feedId = imageFeedId
        if (uri != null && feedId != null) {
            viewModel.uploadFeedImage(feedId, context.contentResolver, uri, cover = true)
        }
        imageFeedId = null
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
                text = stringResource(R.string.admin_news_network_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (!isAdmin) {
            Box(modifier = Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_access_denied),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@Column
        }

        val status = state.status
        if (state.isLoading && status == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Column
        }

        if (status == null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.admin_news_network_load_error),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { viewModel.load() }, modifier = Modifier.padding(top = Spacing.md)) {
                    Text(stringResource(R.string.admin_news_network_retry))
                }
            }
            return@Column
        }

        val paused = status.status.paused

        // ─── Status strip + the two pipeline-wide controls ──────────
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (paused) MutedGrey else HealthyGreen),
                )
                Text(
                    text = if (paused) {
                        stringResource(R.string.admin_news_network_paused)
                    } else {
                        stringResource(R.string.admin_news_network_running)
                    },
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }
            Text(
                text = stringResource(
                    R.string.admin_news_network_last_cycle,
                    formatNewsDateTime(status.status.lastCycleAt),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                text = stringResource(
                    R.string.admin_news_network_next_cycle,
                    formatNewsDateTime(status.status.nextCycleAt),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(
                    R.string.admin_news_network_languages,
                    status.status.enabledLanguages.joinToString(" / ") { it.uppercase(Locale.US) },
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Only a genuinely failed last run is surfaced, with the
            // server's own reason - never a summarised one.
            val lastRunError = status.lastRun?.takeIf { it.status == "FAILED" }?.error
            if (!lastRunError.isNullOrBlank()) {
                Text(
                    text = stringResource(R.string.admin_news_network_last_cycle_failed, lastRunError),
                    style = MaterialTheme.typography.labelSmall,
                    color = ZrpRed,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                Button(
                    onClick = { viewModel.requestAction(NewsNetworkAction.SetPaused(!paused)) },
                    enabled = state.busyId == null,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = if (paused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                        contentDescription = null,
                        modifier = Modifier.padding(end = Spacing.sm),
                    )
                    Text(
                        text = if (paused) {
                            stringResource(R.string.admin_news_network_resume)
                        } else {
                            stringResource(R.string.admin_news_network_pause)
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                OutlinedButton(
                    onClick = { viewModel.requestAction(NewsNetworkAction.RunCycle) },
                    enabled = state.busyId == null,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.Refresh,
                        contentDescription = null,
                        modifier = Modifier.padding(end = Spacing.sm),
                    )
                    Text(
                        text = stringResource(R.string.admin_news_network_run_now),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        val tabs = NewsNetworkTab.entries
        ScrollableTabRow(
            selectedTabIndex = tabs.indexOf(state.tab).coerceAtLeast(0),
            edgePadding = Spacing.lg,
            modifier = Modifier.padding(top = Spacing.sm),
        ) {
            tabs.forEach { tab ->
                Tab(
                    selected = state.tab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = { Text(newsNetworkTabLabel(tab)) },
                )
            }
        }

        when (state.tab) {
            NewsNetworkTab.OVERVIEW -> OverviewTab(state)
            NewsNetworkTab.FEEDS -> FeedsTab(
                state = state,
                onProvision = { scope -> viewModel.requestAction(NewsNetworkAction.Provision(scope)) },
                onToggleFeed = { feed ->
                    viewModel.requestAction(
                        NewsNetworkAction.SetFeedEnabled(feed.id, feed.displayName, !feed.enabled),
                    )
                },
                onPickAvatar = { feed ->
                    imageFeedId = feed.id
                    avatarPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
                onPickCover = { feed ->
                    imageFeedId = feed.id
                    coverPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
                onOpenProfile = onOpenProfile,
            )
            NewsNetworkTab.SOURCES -> SourcesTab(
                state = state,
                onSeed = { viewModel.requestAction(NewsNetworkAction.SeedSources) },
                onVerify = { source -> viewModel.verifySource(source.id, source.name) },
                onClearBackoff = { source ->
                    viewModel.requestAction(NewsNetworkAction.ClearBackoff(source.id, source.name))
                },
                onToggleSource = { source ->
                    viewModel.requestAction(
                        NewsNetworkAction.SetSourceEnabled(source.id, source.name, !source.enabled),
                    )
                },
            )
            NewsNetworkTab.QUEUE -> QueueTab(
                state = state,
                onReject = { story -> viewModel.requestAction(NewsNetworkAction.RejectStory(story.id, story.title)) },
                onCorrect = { story -> viewModel.requestAction(NewsNetworkAction.CorrectStory(story.id, story.title)) },
            )
            NewsNetworkTab.PUBLICATIONS -> PublicationsTab(
                state = state,
                onOpenPost = onOpenPost,
                onRemove = { publication ->
                    viewModel.requestAction(
                        NewsNetworkAction.RemovePublication(
                            publication.id,
                            publication.rendition.headline.ifBlank { publication.story.title },
                        ),
                    )
                },
            )
        }
    }

    state.pendingAction?.let { action ->
        NewsNetworkActionDialog(
            action = action,
            onDismiss = { viewModel.cancelAction() },
            onConfirm = { input -> viewModel.confirmAction(input) },
        )
    }

    val verifyResult = state.verifyResult
    if (verifyResult != null) {
        val name = state.verifySourceName ?: verifyResult.source?.name.orEmpty()
        AlertDialog(
            onDismissRequest = { viewModel.dismissVerifyResult() },
            title = { Text(stringResource(R.string.admin_news_network_verify_title)) },
            text = {
                Text(
                    when {
                        verifyResult.ok && verifyResult.robotsAllowed -> stringResource(
                            R.string.admin_news_network_verify_ok,
                            name,
                            verifyResult.itemCount,
                        )
                        verifyResult.ok -> stringResource(
                            R.string.admin_news_network_verify_ok_robots_blocked,
                            name,
                            verifyResult.itemCount,
                        )
                        !verifyResult.error.isNullOrBlank() -> stringResource(
                            R.string.admin_news_network_verify_failed,
                            name,
                            verifyResult.error,
                        )
                        else -> stringResource(R.string.admin_news_network_verify_failed_generic, name)
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.dismissVerifyResult() }) {
                    Text(stringResource(R.string.action_close))
                }
            },
        )
    }
}

// ─── Overview ────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.OverviewTab(state: AdminNewsNetworkUiState) {
    val status = state.status ?: return
    LazyColumn(
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        item {
            // enabled / defined, not enabled / provisioned: the roster is
            // how many feeds exist in code, so this never implies a feed
            // has been provisioned when it has not.
            val defined = state.roster?.defined ?: status.feeds.total
            StatGrid(
                listOf(
                    Triple(
                        stringResource(R.string.admin_news_network_active_feeds),
                        "${status.feeds.enabled} / $defined",
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_publications_today),
                        status.publications.today.toString(),
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_travel_today),
                        status.publications.travelToday.toString(),
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_queued),
                        status.publications.scheduled.toString(),
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_ready_stories),
                        status.stories.ready.toString(),
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_duplicates_prevented),
                        status.duplicatesPreventedToday.toString(),
                        false,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_failed_publications),
                        status.publications.failed.toString(),
                        status.publications.failed > 0,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_failed_summaries),
                        status.renditions.failedToday.toString(),
                        status.renditions.failedToday > 0,
                    ),
                    Triple(
                        stringResource(R.string.admin_news_network_awaiting_review),
                        status.stories.pendingSensitiveReview.toString(),
                        status.stories.pendingSensitiveReview > 0,
                    ),
                ),
            )
        }

        item {
            // Wrapped in a Column: a lazy item with several children has
            // no layout of its own to space them.
            Column {
                SectionTitle(stringResource(R.string.admin_news_network_source_health))
                StatGrid(
                    listOf(
                        Triple(
                            stringResource(R.string.admin_news_network_health_healthy),
                            status.sourceHealth.HEALTHY.toString(),
                            false,
                        ),
                        Triple(
                            stringResource(R.string.admin_news_network_health_warning),
                            status.sourceHealth.WARNING.toString(),
                            false,
                        ),
                        Triple(
                            stringResource(R.string.admin_news_network_health_failed),
                            status.sourceHealth.FAILED.toString(),
                            status.sourceHealth.FAILED > 0,
                        ),
                        Triple(
                            stringResource(R.string.admin_news_network_health_disabled),
                            status.sourceHealth.DISABLED.toString(),
                            false,
                        ),
                    ),
                )
            }
        }

        item {
            Column {
                SectionTitle(stringResource(R.string.admin_news_network_languages_today))
                if (status.distribution.languages.isEmpty()) {
                    EmptyNote(stringResource(R.string.admin_news_network_nothing_today))
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        status.distribution.languages.forEach { row ->
                            CountPill("${row.language.uppercase(Locale.US)} · ${row.count}")
                        }
                    }
                }
            }
        }

        item {
            Column {
                SectionTitle(stringResource(R.string.admin_news_network_topics_today))
                if (status.distribution.topics.isEmpty()) {
                    EmptyNote(stringResource(R.string.admin_news_network_nothing_today))
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        status.distribution.topics.forEach { row ->
                            CountPill("${row.topic} · ${row.count}")
                        }
                    }
                }
            }
        }
    }
}

// ─── Feeds ───────────────────────────────────────────────────────────

@Composable
private fun ColumnScope.FeedsTab(
    state: AdminNewsNetworkUiState,
    onProvision: (String) -> Unit,
    onToggleFeed: (AdminNewsFeed) -> Unit,
    onPickAvatar: (AdminNewsFeed) -> Unit,
    onPickCover: (AdminNewsFeed) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        item {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    OutlinedButton(
                        onClick = { onProvision("pilot") },
                        enabled = state.busyId == null,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = stringResource(R.string.admin_news_network_provision_pilot),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    OutlinedButton(
                        onClick = { onProvision("all") },
                        enabled = state.busyId == null,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = stringResource(R.string.admin_news_network_provision_all),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Text(
                    text = stringResource(R.string.admin_news_network_provision_note),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
        }

        if (state.feeds.isEmpty()) {
            item { EmptyNote(stringResource(R.string.admin_news_network_no_feeds)) }
        } else {
            items(state.feeds, key = { it.id }) { feed ->
                FeedRow(
                    feed = feed,
                    isBusy = state.busyId == feed.id,
                    enabled = state.busyId == null,
                    onToggle = { onToggleFeed(feed) },
                    onPickAvatar = { onPickAvatar(feed) },
                    onPickCover = { onPickCover(feed) },
                    onOpenProfile = { onOpenProfile(feed.user.username) },
                )
            }
        }
    }
}

// FlowRow for the action buttons: three of them (enable/disable, avatar,
// banner) do not fit one line on a narrow phone, and wrapping is better
// than squeezing labels that name what the button will do.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FeedRow(
    feed: AdminNewsFeed,
    isBusy: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
    onPickAvatar: () -> Unit,
    onPickCover: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = feed.displayName,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (feed.isPilot) {
                Text(
                    text = stringResource(R.string.admin_news_network_pilot),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(start = Spacing.sm)
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            Text(
                text = if (feed.enabled) {
                    stringResource(R.string.admin_news_network_state_enabled)
                } else {
                    stringResource(R.string.admin_news_network_state_disabled)
                },
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = if (feed.enabled) HealthyGreen else MutedGrey,
                modifier = Modifier.padding(start = Spacing.sm),
            )
        }

        Text(
            text = "@${feed.user.username}",
            style = MaterialTheme.typography.labelSmall,
            color = ZrpRed,
            modifier = Modifier.padding(top = 2.dp).clickable(onClick = onOpenProfile, role = Role.Button),
        )

        if (feed.user.banned) {
            Text(
                text = stringResource(R.string.admin_news_network_feed_banned),
                style = MaterialTheme.typography.labelSmall,
                color = ZrpRed,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Text(
            text = stringResource(
                R.string.admin_news_network_feed_meta,
                feed.language.uppercase(Locale.US),
                feed.country ?: feed.region,
                feed._count.publications,
                feed.maxPostsPerDay,
                feed.minMinutesBetweenPosts,
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            FlowRow(
                modifier = Modifier.padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                TextButton(onClick = onToggle, enabled = enabled) {
                    Text(
                        text = if (feed.enabled) {
                            stringResource(R.string.admin_news_network_disable)
                        } else {
                            stringResource(R.string.admin_news_network_enable)
                        },
                    )
                }
                TextButton(onClick = onPickAvatar, enabled = enabled) {
                    Text(stringResource(R.string.admin_news_network_set_avatar))
                }
                TextButton(onClick = onPickCover, enabled = enabled) {
                    Text(stringResource(R.string.admin_news_network_set_banner))
                }
            }
            Text(
                text = stringResource(R.string.admin_news_network_image_hint),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─── Sources ─────────────────────────────────────────────────────────

@Composable
private fun ColumnScope.SourcesTab(
    state: AdminNewsNetworkUiState,
    onSeed: () -> Unit,
    onVerify: (AdminNewsSource) -> Unit,
    onClearBackoff: (AdminNewsSource) -> Unit,
    onToggleSource: (AdminNewsSource) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        item {
            OutlinedButton(
                onClick = onSeed,
                enabled = state.busyId == null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.admin_news_network_seed_sources))
            }
        }

        if (state.sources.isEmpty()) {
            item { EmptyNote(stringResource(R.string.admin_news_network_no_sources)) }
        } else {
            items(state.sources, key = { it.id }) { source ->
                SourceRow(
                    source = source,
                    isBusy = state.busyId == source.id || state.busyId == "verify-${source.id}",
                    enabled = state.busyId == null,
                    onVerify = { onVerify(source) },
                    onClearBackoff = { onClearBackoff(source) },
                    onToggle = { onToggleSource(source) },
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SourceRow(
    source: AdminNewsSource,
    isBusy: Boolean,
    enabled: Boolean,
    onVerify: () -> Unit,
    onClearBackoff: () -> Unit,
    onToggle: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = source.name,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = newsSourceStatusLabel(source.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = newsSourceStatusColor(source.status),
                modifier = Modifier
                    .padding(start = Spacing.sm)
                    .clip(RoundedCornerShape(50))
                    .background(newsSourceStatusColor(source.status).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Text(
            text = stringResource(R.string.admin_news_network_source_tier, source.trustTier),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        // The feed URL wraps rather than ellipsing: it is the field an
        // admin has to be able to read in full before trusting a source.
        Text(
            text = source.feedUrl,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Text(
            text = stringResource(
                R.string.admin_news_network_source_meta,
                source._count.references,
                formatNewsDateTime(source.lastSuccessAt),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        if (source.backoffUntil != null) {
            Text(
                text = stringResource(
                    R.string.admin_news_network_backoff_until,
                    formatNewsDateTime(source.backoffUntil),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = WarningAmber,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        if (!source.lastError.isNullOrBlank()) {
            Text(
                text = source.lastError,
                style = MaterialTheme.typography.labelSmall,
                color = ZrpRed,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            FlowRow(
                modifier = Modifier.padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                TextButton(onClick = onVerify, enabled = enabled) {
                    Text(stringResource(R.string.admin_news_network_verify))
                }
                // Only offered when there is a backoff to clear, exactly
                // like the website's own console.
                if (source.backoffUntil != null) {
                    TextButton(onClick = onClearBackoff, enabled = enabled) {
                        Text(stringResource(R.string.admin_news_network_clear_backoff))
                    }
                }
                TextButton(onClick = onToggle, enabled = enabled) {
                    Text(
                        text = if (source.enabled) {
                            stringResource(R.string.admin_news_network_disable)
                        } else {
                            stringResource(R.string.admin_news_network_enable)
                        },
                    )
                }
            }
        }
    }
}

// ─── Editorial queue ─────────────────────────────────────────────────

@Composable
private fun ColumnScope.QueueTab(
    state: AdminNewsNetworkUiState,
    onReject: (AdminNewsStory) -> Unit,
    onCorrect: (AdminNewsStory) -> Unit,
) {
    if (state.stories.isEmpty()) {
        LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(Spacing.lg)) {
            item { EmptyNote(stringResource(R.string.admin_news_network_no_stories)) }
        }
        return
    }

    LazyColumn(
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        items(state.stories, key = { it.id }) { story ->
            StoryRow(
                story = story,
                isBusy = state.busyId == story.id,
                enabled = state.busyId == null,
                onReject = { onReject(story) },
                onCorrect = { onCorrect(story) },
            )
        }
    }
}

@Composable
private fun StoryRow(
    story: AdminNewsStory,
    isBusy: Boolean,
    enabled: Boolean,
    onReject: () -> Unit,
    onCorrect: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(text = story.title, fontWeight = FontWeight.Bold)

        Text(
            text = stringResource(
                R.string.admin_news_network_story_meta,
                story.status,
                story.confidence,
                String.format(Locale.getDefault(), "%.2f", story.importance),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Text(
            text = stringResource(
                R.string.admin_news_network_story_context,
                story.topic,
                story.country ?: story.region,
                story.sourceCount,
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        // The three editorial flags, each its own line so none of them
        // can be lost to truncation - "sensitive" in particular is the
        // one that says a human must read this before it goes out.
        if (story.sensitive) {
            Text(
                text = stringResource(R.string.admin_news_network_flag_sensitive),
                style = MaterialTheme.typography.labelSmall,
                color = ZrpRed,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (story.isBreaking) {
            Text(
                text = stringResource(R.string.admin_news_network_flag_breaking),
                style = MaterialTheme.typography.labelSmall,
                color = WarningAmber,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (story.isTravel) {
            Text(
                text = stringResource(R.string.admin_news_network_flag_travel),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        // Every attribution the story was built from, publisher first -
        // the whole point of the queue is comparing what the sources
        // said against what was written.
        story.references.forEach { reference ->
            Text(
                text = "${reference.source.publisher}: ${reference.title}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        story.renditions.forEach { rendition ->
            Text(
                text = "${rendition.language.uppercase(Locale.US)} · " +
                    if (rendition.status == "READY") {
                        rendition.headline
                    } else {
                        rendition.error ?: rendition.status
                    },
                style = MaterialTheme.typography.labelSmall,
                color = if (rendition.status == "READY") {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    ZrpRed
                },
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (!story.correctionNote.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_news_network_correction, story.correctionNote),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onReject, enabled = enabled) {
                    Text(stringResource(R.string.admin_news_network_reject), color = ZrpRed)
                }
                TextButton(onClick = onCorrect, enabled = enabled) {
                    Text(stringResource(R.string.admin_news_network_correct))
                }
            }
        }
    }
}

// ─── Publications ────────────────────────────────────────────────────

@Composable
private fun ColumnScope.PublicationsTab(
    state: AdminNewsNetworkUiState,
    onOpenPost: (String) -> Unit,
    onRemove: (AdminNewsPublication) -> Unit,
) {
    if (state.publications.isEmpty()) {
        LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(Spacing.lg)) {
            item { EmptyNote(stringResource(R.string.admin_news_network_no_publications)) }
        }
        return
    }

    LazyColumn(
        modifier = Modifier.weight(1f),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        items(state.publications, key = { it.id }) { publication ->
            PublicationRow(
                publication = publication,
                isBusy = state.busyId == publication.id,
                enabled = state.busyId == null,
                onOpenPost = onOpenPost,
                onRemove = { onRemove(publication) },
            )
        }
    }
}

@Composable
private fun PublicationRow(
    publication: AdminNewsPublication,
    isBusy: Boolean,
    enabled: Boolean,
    onOpenPost: (String) -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(
            text = publication.rendition.headline.ifBlank { publication.story.title },
            fontWeight = FontWeight.Bold,
        )

        Text(
            text = stringResource(
                R.string.admin_news_network_publication_meta,
                publication.feed.displayName,
                publication.language.uppercase(Locale.US),
                publication.status,
                formatNewsDateTime(publication.publishedAt ?: publication.scheduledFor),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        if (!publication.story.correctionNote.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_news_network_correction, publication.story.correctionNote),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (!publication.removedReason.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_news_network_removed_reason, publication.removedReason),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (!publication.error.isNullOrBlank()) {
            Text(
                text = publication.error,
                style = MaterialTheme.typography.labelSmall,
                color = ZrpRed,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // The post opens natively in the app's own post view -
                // there is no browser hand-off anywhere in this console.
                val postId = publication.postId
                if (postId != null) {
                    TextButton(onClick = { onOpenPost(postId) }) {
                        Icon(
                            Icons.Filled.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.padding(end = 4.dp).size(16.dp),
                        )
                        Text(stringResource(R.string.admin_news_network_view_post))
                    }
                }
                // Only a live post can be taken down; a SCHEDULED,
                // FAILED or already REMOVED row has nothing to remove.
                if (publication.status == "PUBLISHED") {
                    TextButton(onClick = onRemove, enabled = enabled) {
                        Text(stringResource(R.string.admin_news_network_remove), color = ZrpRed)
                    }
                }
            }
        }
    }
}

// ─── Confirmation dialogs ────────────────────────────────────────────

/**
 * One dialog for every action. Reject/correct/remove additionally
 * collect the reason or note their route requires, and their confirm
 * button stays disabled until something has been typed - the server
 * rejects a blank one, so offering it would only produce a 400.
 */
@Composable
private fun NewsNetworkActionDialog(
    action: NewsNetworkAction,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var input by remember(action) { mutableStateOf("") }

    val needsInput = action is NewsNetworkAction.RejectStory ||
        action is NewsNetworkAction.CorrectStory ||
        action is NewsNetworkAction.RemovePublication

    val title = when (action) {
        is NewsNetworkAction.SetPaused -> if (action.paused) {
            stringResource(R.string.admin_news_network_pause)
        } else {
            stringResource(R.string.admin_news_network_resume)
        }
        is NewsNetworkAction.RunCycle -> stringResource(R.string.admin_news_network_run_now)
        is NewsNetworkAction.Provision -> if (action.scope == "all") {
            stringResource(R.string.admin_news_network_provision_all)
        } else {
            stringResource(R.string.admin_news_network_provision_pilot)
        }
        is NewsNetworkAction.SeedSources -> stringResource(R.string.admin_news_network_seed_sources)
        is NewsNetworkAction.SetFeedEnabled -> if (action.enabled) {
            stringResource(R.string.admin_news_network_enable)
        } else {
            stringResource(R.string.admin_news_network_disable)
        }
        is NewsNetworkAction.SetSourceEnabled -> if (action.enabled) {
            stringResource(R.string.admin_news_network_enable)
        } else {
            stringResource(R.string.admin_news_network_disable)
        }
        is NewsNetworkAction.ClearBackoff -> stringResource(R.string.admin_news_network_clear_backoff)
        is NewsNetworkAction.RejectStory -> stringResource(R.string.admin_news_network_reject)
        is NewsNetworkAction.CorrectStory -> stringResource(R.string.admin_news_network_correct)
        is NewsNetworkAction.RemovePublication -> stringResource(R.string.admin_news_network_remove)
    }

    val body = when (action) {
        is NewsNetworkAction.SetPaused -> if (action.paused) {
            stringResource(R.string.admin_news_network_pause_confirm)
        } else {
            stringResource(R.string.admin_news_network_resume_confirm)
        }
        is NewsNetworkAction.RunCycle -> stringResource(R.string.admin_news_network_run_confirm)
        is NewsNetworkAction.Provision -> if (action.scope == "all") {
            stringResource(R.string.admin_news_network_provision_all_confirm)
        } else {
            stringResource(R.string.admin_news_network_provision_pilot_confirm)
        }
        is NewsNetworkAction.SeedSources -> stringResource(R.string.admin_news_network_seed_confirm)
        is NewsNetworkAction.SetFeedEnabled -> if (action.enabled) {
            stringResource(R.string.admin_news_network_feed_enable_confirm, action.name)
        } else {
            stringResource(R.string.admin_news_network_feed_disable_confirm, action.name)
        }
        is NewsNetworkAction.SetSourceEnabled -> if (action.enabled) {
            stringResource(R.string.admin_news_network_source_enable_confirm, action.name)
        } else {
            stringResource(R.string.admin_news_network_source_disable_confirm, action.name)
        }
        is NewsNetworkAction.ClearBackoff ->
            stringResource(R.string.admin_news_network_clear_backoff_confirm, action.name)
        is NewsNetworkAction.RejectStory ->
            stringResource(R.string.admin_news_network_reject_confirm, action.title)
        is NewsNetworkAction.CorrectStory ->
            stringResource(R.string.admin_news_network_correct_confirm, action.title)
        is NewsNetworkAction.RemovePublication ->
            stringResource(R.string.admin_news_network_remove_confirm, action.headline)
    }

    val inputLabel = when (action) {
        is NewsNetworkAction.RejectStory -> stringResource(R.string.admin_news_network_reject_reason)
        is NewsNetworkAction.CorrectStory -> stringResource(R.string.admin_news_network_correction_note)
        else -> stringResource(R.string.admin_news_network_remove_reason)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(body)
                if (needsInput) {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { input = it },
                        label = { Text(inputLabel) },
                        modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                    )
                }
            }
        },
        confirmButton = {
            val canConfirm = !needsInput || input.isNotBlank()
            TextButton(onClick = { onConfirm(input) }, enabled = canConfirm) {
                Text(
                    text = stringResource(R.string.admin_reports_confirm_action),
                    // Only the live button is red; a disabled one must not
                    // look like it is still waiting to be pressed.
                    color = if (canConfirm) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_cancel)) }
        },
    )
}

// ─── Small shared pieces ─────────────────────────────────────────────

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(bottom = Spacing.sm),
    )
}

@Composable
private fun EmptyNote(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun CountPill(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier
            .padding(bottom = Spacing.sm)
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/**
 * A plain (non-lazy) two-column grid: these grids live inside a
 * LazyColumn item and are always short, fixed lists, and a nested Lazy*
 * layout would be measured with an unbounded constraint - the crash
 * class already documented on the admin dashboard's own stat grid.
 */
@Composable
private fun StatGrid(tiles: List<Triple<String, String, Boolean>>) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md), modifier = Modifier.fillMaxWidth()) {
                row.forEach { (label, value, alert) ->
                    Box(modifier = Modifier.weight(1f)) {
                        NewsStatTile(label = label, value = value, alert = alert)
                    }
                }
                if (row.size < 2) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun NewsStatTile(label: String, value: String, alert: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            // Only a non-zero count of something wrong is red, matching
            // the website's own `tone === "alert" && value > 0`.
            color = if (alert) ZrpRed else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun newsNetworkTabLabel(tab: NewsNetworkTab): String = when (tab) {
    NewsNetworkTab.OVERVIEW -> stringResource(R.string.admin_news_network_tab_overview)
    NewsNetworkTab.FEEDS -> stringResource(R.string.admin_news_network_tab_feeds)
    NewsNetworkTab.SOURCES -> stringResource(R.string.admin_news_network_tab_sources)
    NewsNetworkTab.QUEUE -> stringResource(R.string.admin_news_network_tab_queue)
    NewsNetworkTab.PUBLICATIONS -> stringResource(R.string.admin_news_network_tab_publications)
}

/** The real NewsSourceStatus enum, translated for display only. */
@Composable
private fun newsSourceStatusLabel(status: String): String = when (status) {
    "HEALTHY" -> stringResource(R.string.admin_news_network_health_healthy)
    "WARNING" -> stringResource(R.string.admin_news_network_health_warning)
    "FAILED" -> stringResource(R.string.admin_news_network_health_failed)
    "DISABLED" -> stringResource(R.string.admin_news_network_health_disabled)
    else -> status
}

private fun newsSourceStatusColor(status: String): Color = when (status) {
    "HEALTHY" -> HealthyGreen
    "WARNING" -> WarningAmber
    "FAILED" -> ZrpRed
    else -> MutedGrey
}

@Composable
private fun formatNewsDateTime(iso: String?): String =
    if (iso.isNullOrBlank()) stringResource(R.string.admin_news_network_never) else formatTicketDateTime(iso)

@Composable
private fun newsNetworkMessageText(message: NewsNetworkMessage): String = when (message) {
    is NewsNetworkMessage.Paused -> stringResource(R.string.admin_news_network_paused_done)
    is NewsNetworkMessage.Resumed -> stringResource(R.string.admin_news_network_resumed_done)
    is NewsNetworkMessage.CycleRan ->
        stringResource(R.string.admin_news_network_cycle_done, message.published, message.scheduled)
    is NewsNetworkMessage.CycleSkipped -> if (message.reason.isNullOrBlank()) {
        stringResource(R.string.admin_news_network_cycle_skipped_generic)
    } else {
        stringResource(R.string.admin_news_network_cycle_skipped, message.reason)
    }
    is NewsNetworkMessage.Provisioned -> stringResource(
        R.string.admin_news_network_provisioned,
        message.created,
        message.updated,
        message.skipped,
    )
    is NewsNetworkMessage.Seeded ->
        stringResource(R.string.admin_news_network_seeded, message.created, message.existing)
    is NewsNetworkMessage.FeedEnabled -> if (message.enabled) {
        stringResource(R.string.admin_news_network_feed_enabled_done)
    } else {
        stringResource(R.string.admin_news_network_feed_disabled_done)
    }
    is NewsNetworkMessage.SourceEnabled -> if (message.enabled) {
        stringResource(R.string.admin_news_network_source_enabled_done)
    } else {
        stringResource(R.string.admin_news_network_source_disabled_done)
    }
    is NewsNetworkMessage.BackoffCleared -> stringResource(R.string.admin_news_network_backoff_cleared)
    is NewsNetworkMessage.StoryRejected -> stringResource(R.string.admin_news_network_story_rejected)
    is NewsNetworkMessage.CorrectionPublished -> stringResource(R.string.admin_news_network_correction_published)
    is NewsNetworkMessage.PublicationRemoved -> stringResource(R.string.admin_news_network_post_removed)
    is NewsNetworkMessage.AvatarUpdated -> if (message.cover) {
        stringResource(R.string.admin_news_network_banner_updated)
    } else {
        stringResource(R.string.admin_news_network_avatar_updated)
    }
}
