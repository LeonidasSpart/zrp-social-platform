package one.zrp.social.mobile.ui.marketplace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.ui.components.ZrpEmptyState

/**
 * ZRP Market Plus browse - MarketplaceHomePage/CategoryPage/SearchPage
 * folded into one screen: search bar, category chips (tap to filter
 * in place), a sort menu, and an infinite-scroll grid of the same real
 * GET /listings results those three web pages all render with
 * ListingCard, plus real entry points into Favorites, My Listings, and
 * Create Listing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketplaceScreen(
    onBack: () -> Unit,
    onListingClick: (String) -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenMyListings: () -> Unit,
    onCreateListing: () -> Unit,
) {
    val viewModel: MarketplaceViewModel = viewModel(
        factory = remember { MarketplaceViewModelFactory(MarketplaceRepository()) },
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
                text = stringResource(R.string.marketplace_hero_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .weight(1f),
            )
            IconButton(onClick = onOpenMyListings) {
                Icon(Icons.Filled.ListAlt, contentDescription = stringResource(R.string.marketplace_my_listings))
            }
            IconButton(onClick = onOpenFavorites) {
                Icon(Icons.Filled.Favorite, contentDescription = stringResource(R.string.marketplace_favorites))
            }
            IconButton(onClick = onCreateListing) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.marketplace_create_listing))
            }
        }
        Text(
            text = stringResource(R.string.marketplace_hero_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                placeholder = { Text(stringResource(R.string.marketplace_search_placeholder)) },
                singleLine = true,
                trailingIcon = {
                    IconButton(onClick = viewModel::onSearch) {
                        Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.marketplace_search))
                    }
                },
                modifier = Modifier.weight(1f),
            )
        }

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = state.selectedCategory == null,
                    onClick = { viewModel.onCategorySelect(null) },
                    label = { Text(stringResource(R.string.marketplace_all_categories)) },
                )
            }
            items(allMarketplaceCategories, key = { it }) { category ->
                FilterChip(
                    selected = state.selectedCategory == category,
                    onClick = { viewModel.onCategorySelect(category) },
                    label = { Text(categoryLabel(category)) },
                )
            }
        }

        SortMenu(sort = state.sort, onSortChange = viewModel::onSortChange)
        HorizontalDivider()

        val gridState = rememberLazyGridState()
        val shouldLoadMore by remember {
            derivedStateOf {
                val lastVisible = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                val totalItems = gridState.layoutInfo.totalItemsCount
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
                    ZrpEmptyState(
                        icon = Icons.Filled.ListAlt,
                        title = stringResource(
                            if (state.selectedCategory != null || state.searchQuery.isNotBlank()) {
                                R.string.marketplace_no_listings_found
                            } else {
                                R.string.marketplace_no_listings_yet
                            },
                        ),
                    )
                }
            }
            else -> {
                LazyVerticalGrid(
                    state = gridState,
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.listings, key = { it.id }) { listing ->
                        ListingCardView(listing = listing, onClick = { onListingClick(listing.id) })
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SortMenu(sort: String, onSortChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val label = when (sort) {
        "priceLow" -> stringResource(R.string.marketplace_sort_price_low)
        "priceHigh" -> stringResource(R.string.marketplace_sort_price_high)
        else -> stringResource(R.string.marketplace_sort_newest)
    }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        OutlinedTextField(
            value = label,
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.marketplace_sort_newest)) },
                onClick = { onSortChange("newest"); expanded = false },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.marketplace_sort_price_low)) },
                onClick = { onSortChange("priceLow"); expanded = false },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.marketplace_sort_price_high)) },
                onClick = { onSortChange("priceHigh"); expanded = false },
            )
        }
    }
}
