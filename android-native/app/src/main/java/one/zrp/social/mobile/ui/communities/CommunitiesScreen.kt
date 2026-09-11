package one.zrp.social.mobile.ui.communities

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.TrendingHashtag
import one.zrp.social.mobile.ui.search.ExploreTrendingViewModel
import one.zrp.social.mobile.ui.search.ExploreTrendingViewModelFactory
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The reference design's "Communities" screen, built strictly on real
 * data - the exact same GET /hashtags/trending the "See all" trending
 * list (ExploreTrendingScreen) already calls, reusing its ViewModel and
 * repository rather than a second copy of the same fetch.
 *
 * ZRP has no community-membership feature anywhere in the product
 * (confirmed against both web and this app's own API surface during the
 * redesign's feature audit) - no join state, no member list, no
 * membership database. So unlike the reference mock's "Join" buttons,
 * every card here says "View" and does exactly that: opens the real,
 * public hashtag feed (HashtagScreen). Nothing implies membership that
 * doesn't exist, and the post counts shown are the real counts from the
 * same endpoint every other trending surface in the app already trusts.
 */
@Composable
fun CommunitiesScreen(onBack: () -> Unit, onOpenHashtag: (String) -> Unit) {
    val viewModel: ExploreTrendingViewModel = viewModel(
        factory = remember { ExploreTrendingViewModelFactory(SearchRepository()) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.nav_communities),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        Text(
            text = stringResource(R.string.communities_screen_note),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(Spacing.lg),
        )

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.hashtags.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.right_panel_no_trending),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = Spacing.lg,
                        vertical = Spacing.sm,
                    ),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    items(state.hashtags, key = { it.tag }) { hashtag ->
                        CommunityCard(hashtag = hashtag, onClick = { onOpenHashtag(hashtag.tag) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CommunityCard(hashtag: TrendingHashtag, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = CircleShape, color = ZrpRed.copy(alpha = 0.12f)) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.padding(Spacing.md),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Groups,
                        contentDescription = null,
                        tint = ZrpRed,
                        modifier = Modifier.size(IconSize.md),
                    )
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = Spacing.md),
            ) {
                Text(
                    text = "#${hashtag.tag}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.right_panel_posts_count, hashtag.count),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedButton(onClick = onClick) {
                Text(stringResource(R.string.communities_view_action))
            }
        }
    }
}
