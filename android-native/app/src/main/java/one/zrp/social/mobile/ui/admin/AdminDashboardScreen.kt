package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The native surface onto /admin (src/app/admin/page.tsx) - stat cards
 * from GET /admin/stats plus a quick action per admin section the
 * website's own admin nav offers (Users/Posts/Reports, plus the
 * Appeals/Ads/Marketplace/Opportunity/HELP/Journalists/Music review
 * queues). Entry point is gated at the Settings row (see
 * SettingsScreen), never shown to a non-staff user - every action here
 * would still 401/403 server-side even if it somehow were.
 */
@Composable
fun AdminDashboardScreen(
    onBack: () -> Unit,
    onOpenUsers: () -> Unit,
    onOpenPosts: () -> Unit,
    onOpenReports: () -> Unit,
    onOpenAppeals: () -> Unit,
    onOpenAds: () -> Unit,
    onOpenMarketplace: () -> Unit,
    onOpenOpportunity: () -> Unit,
    onOpenHelp: () -> Unit,
    onOpenJournalists: () -> Unit,
    onOpenMusicArtists: () -> Unit,
) {
    val viewModel: AdminDashboardViewModel = viewModel(
        factory = remember { AdminDashboardViewModelFactory(AdminRepository()) },
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.admin_dash_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            val stats = state.stats
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.lg),
            ) {
                if (stats != null) {
                    val roleCounts = stats.roleCounts
                    val cards = listOf(
                        stringResource(R.string.admin_dash_total_users) to stats.users.toString(),
                        stringResource(R.string.admin_dash_total_posts) to stats.posts.toString(),
                        stringResource(R.string.admin_dash_total_comments) to stats.comments.toString(),
                        stringResource(R.string.admin_dash_total_reports) to stats.reports.toString(),
                        stringResource(R.string.admin_dash_pending_reports) to stats.pendingReports.toString(),
                        stringResource(R.string.admin_dash_admins) to (roleCounts["ADMIN"] ?: 0).toString(),
                        stringResource(R.string.admin_dash_moderators) to (roleCounts["MODERATOR"] ?: 0).toString(),
                    )
                    // A real (non-lazy) grid, not LazyVerticalGrid: this
                    // whole screen already lives inside a verticalScroll
                    // Column above, and any Lazy* layout nested in a
                    // verticalScroll container gets measured with an
                    // unbounded max height, which Compose deterministically
                    // crashes on ("measured with an infinity maximum
                    // height constraint") - the same bug class already
                    // fixed in MemoryPlayerView.kt and
                    // PlayChallengeScreen.kt. `cards` is always a short,
                    // fixed-size list (7 stat cards), so nothing is lost
                    // by not virtualizing.
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
                                        StatCard(label = label, value = value)
                                    }
                                }
                                if (rowCards.size < 2) {
                                    Box(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }

                Text(
                    text = stringResource(R.string.admin_dash_quick_actions),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.xl, bottom = Spacing.md),
                )

                OutlinedButton(onClick = onOpenReports, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Flag, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_view_reports))
                }
                OutlinedButton(onClick = onOpenUsers, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.People, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_manage_users))
                }
                OutlinedButton(onClick = onOpenPosts, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Article, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_manage_posts))
                }
                OutlinedButton(onClick = onOpenAppeals, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Gavel, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_review_appeals))
                }
                OutlinedButton(onClick = onOpenAds, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Campaign, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_review_ads))
                }
                OutlinedButton(onClick = onOpenMarketplace, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Storefront, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_review_marketplace))
                }
                OutlinedButton(onClick = onOpenOpportunity, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Work, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_review_opportunity))
                }
                OutlinedButton(onClick = onOpenHelp, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(
                        Icons.Filled.VolunteerActivism,
                        contentDescription = null,
                        modifier = Modifier.padding(end = Spacing.sm),
                    )
                    Text(stringResource(R.string.admin_dash_review_help))
                }
                OutlinedButton(onClick = onOpenJournalists, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Newspaper, contentDescription = null, modifier = Modifier.padding(end = Spacing.sm))
                    Text(stringResource(R.string.admin_dash_manage_journalists))
                }
                OutlinedButton(
                    onClick = onOpenMusicArtists,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                ) {
                    Icon(
                        Icons.Filled.LibraryMusic,
                        contentDescription = null,
                        modifier = Modifier.padding(end = Spacing.sm),
                    )
                    Text(stringResource(R.string.admin_dash_manage_music_artists))
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String) {
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
