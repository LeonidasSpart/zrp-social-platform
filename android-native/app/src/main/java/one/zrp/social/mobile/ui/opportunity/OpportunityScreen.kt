package one.zrp.social.mobile.ui.opportunity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.OpportunityRepository

/**
 * ZRP OPPORTUNITY browse - ported from OpportunityHomePage.tsx: Post
 * Opportunity/My Listings/My Applications entry points, a type filter
 * row + remote-only toggle, and an infinite-scroll list of the same real
 * GET /opportunity results ListingCard renders.
 */
@Composable
fun OpportunityScreen(
    onBack: () -> Unit,
    onListingClick: (String) -> Unit,
    onPostOpportunity: () -> Unit,
    onOpenMyListings: () -> Unit,
    onOpenMyApplications: () -> Unit,
) {
    val viewModel: OpportunityViewModel = viewModel(
        factory = remember { OpportunityViewModelFactory(OpportunityRepository()) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = stringResource(R.string.opportunity_hero_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp),
            )
            IconButton(onClick = onOpenMyApplications) {
                Icon(Icons.Filled.Description, contentDescription = stringResource(R.string.opportunity_my_applications))
            }
            IconButton(onClick = onOpenMyListings) {
                Icon(Icons.Filled.ListAlt, contentDescription = stringResource(R.string.opportunity_my_listings))
            }
            IconButton(onClick = onPostOpportunity) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.opportunity_post_opportunity))
            }
        }
        Text(
            text = stringResource(R.string.opportunity_hero_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = state.selectedType == null,
                    onClick = { viewModel.onTypeSelect(null) },
                    label = { Text(stringResource(R.string.opportunity_all_types)) },
                )
            }
            items(allOpportunityTypes, key = { it }) { type ->
                FilterChip(
                    selected = state.selectedType == type,
                    onClick = { viewModel.onTypeSelect(type) },
                    label = { Text(opportunityTypeLabel(type)) },
                )
            }
            item {
                FilterChip(
                    selected = state.remoteOnly,
                    onClick = viewModel::onRemoteOnlyToggle,
                    label = { Text(stringResource(R.string.opportunity_remote_only)) },
                )
            }
        }

        val listState = rememberLazyListState()
        val shouldLoadMore by remember {
            derivedStateOf {
                val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                val totalItems = listState.layoutInfo.totalItemsCount
                totalItems > 0 && lastVisible >= totalItems - 4
            }
        }
        LaunchedEffect(shouldLoadMore) {
            if (shouldLoadMore) viewModel.loadMore()
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.listings.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.opportunity_no_listings_yet),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.listings, key = { it.id }) { listing ->
                        OpportunityCardView(listing = listing, onClick = { onListingClick(listing.id) })
                    }
                    if (state.isLoadingMore) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.padding(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
