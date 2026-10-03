package one.zrp.social.mobile.ui.search

import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SmartDisplay
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.Work
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.NewsArticleSummary
import one.zrp.social.mobile.network.SearchMusicResult
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.marketplace.ListingCardView
import one.zrp.social.mobile.ui.opportunity.OpportunityCardView
import one.zrp.social.mobile.util.localizedError

/**
 * The Search tab: real typed search against the website's own /search
 * endpoint, plus a pre-search "Discover" state built from the same
 * suggested-users/trending-hashtags endpoints the Home feed's widgets
 * already use. No fake results, no separate search index.
 *
 * Advanced Search (Task #2) adds: 8 category tabs (People/Posts/
 * Hashtags/Communities/News/Music/Opportunities/Marketplace), a sort
 * dropdown (Relevance/Recent/Most engaged/Trending), a filter panel
 * (date range, language/country, media type, verified/professional/
 * creator), and real cursor-based pagination once a single category is
 * selected. "All" mode keeps the pre-existing teaser-sections layout
 * (now with "See all" links per new category); a single category
 * switches into a full paginated list, mirroring the web page's own
 * AllModeSections / SingleCategoryResults split - see
 * docs/advanced-search-architecture.md for the shared API contract.
 */
@Composable
fun SearchScreen(
    onAuthorClick: (String) -> Unit,
    onOpenMusic: () -> Unit,
    onOpenMarketplace: () -> Unit,
    onOpenOpportunity: () -> Unit,
    onOpenAid: () -> Unit,
    onOpenPlay: () -> Unit,
    onOpenNews: () -> Unit,
    onOpenShorts: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenComments: (postId: String) -> Unit,
    // See HomeScreen's own doc comment - a quoted post's preview opens
    // its real detail page, not the comments-only screen.
    onOpenPost: (postId: String) -> Unit = onOpenComments,
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
    onOpenTrending: () -> Unit = {},
    onOpenExplorePeople: () -> Unit = {},
    onOpenCommunity: (String) -> Unit = {},
    onOpenNewsArticle: (String) -> Unit = {},
    onOpenListing: (String) -> Unit = {},
    onOpenOpportunityListing: (String) -> Unit = {},
    onOpenMusicArtist: (String) -> Unit = {},
    onOpenMusicAlbum: (String) -> Unit = {},
    onOpenMusicPlaylist: (String) -> Unit = {},
) {
    val viewModel: SearchViewModel = viewModel(
        factory = remember { SearchViewModelFactory(SearchRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var reportingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingReport by remember { mutableStateOf(false) }
    var reportError by remember { mutableStateOf<String?>(null) }
    var deletingPostId by remember { mutableStateOf<String?>(null) }
    var isDeletingPost by remember { mutableStateOf(false) }
    var editingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingEdit by remember { mutableStateOf(false) }
    var editError by remember { mutableStateOf<String?>(null) }

    val resultCallbacks = remember(viewModel) {
        SearchResultCallbacks(
            onAuthorClick = onAuthorClick,
            onOpenHashtag = onOpenHashtag,
            onOpenCommunity = onOpenCommunity,
            onOpenNewsArticle = onOpenNewsArticle,
            onOpenListing = onOpenListing,
            onOpenOpportunityListing = onOpenOpportunityListing,
            onOpenMusicArtist = onOpenMusicArtist,
            onOpenMusicAlbum = onOpenMusicAlbum,
            onOpenMusicPlaylist = onOpenMusicPlaylist,
            onLikeClick = { postId -> viewModel.toggleLike(postId) },
            onCommentClick = onOpenComments,
            onOpenPost = onOpenPost,
            onRepostClick = { postId -> viewModel.toggleRepost(postId) },
            onBookmarkClick = { postId -> viewModel.toggleBookmark(postId) },
            onReportClick = { postId -> reportingPostId = postId; reportError = null },
            onDeleteClick = { postId -> deletingPostId = postId },
            onEditClick = { postId -> editingPostId = postId; editError = null },
            onQuoteClick = onOpenQuotePost,
            onViewReposts = onOpenReposts,
            onViewQuotes = onOpenQuotes,
            onOpenVideoViewer = onOpenVideoViewer,
            onVoteClick = { postId, pollId, optionIndex -> viewModel.votePoll(postId, pollId, optionIndex) },
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = { viewModel.onQueryChange(it) },
            placeholder = { Text(stringResource(R.string.search_placeholder)) },
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (state.query.isNotEmpty()) {
                    IconButton(onClick = { viewModel.onQueryChange("") }) {
                        Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.action_clear))
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        )

        if (state.query.trim().length < 2) {
            DiscoverContent(
                state = state,
                onAuthorClick = onAuthorClick,
                onHashtagClick = { tag -> viewModel.onHashtagClick(tag) },
                onOpenMusic = onOpenMusic,
                onOpenMarketplace = onOpenMarketplace,
                onOpenOpportunity = onOpenOpportunity,
                onOpenAid = onOpenAid,
                onOpenPlay = onOpenPlay,
                onOpenNews = onOpenNews,
                onOpenShorts = onOpenShorts,
                onOpenAi = onOpenAi,
                onOpenTrending = onOpenTrending,
                onOpenExplorePeople = onOpenExplorePeople,
            )
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                CategoryTabsRow(selected = state.category, onSelect = viewModel::onCategorySelect)
                SortAndFiltersRow(
                    sort = state.sort,
                    filtersActive = state.filters.isActive,
                    showFilters = state.showFilters,
                    onSortSelect = viewModel::onSortSelect,
                    onToggleFilters = viewModel::onToggleFiltersPanel,
                )
                if (state.showFilters) {
                    FiltersPanel(
                        category = state.category,
                        filters = state.filters,
                        onChange = viewModel::onFiltersChange,
                        onClear = viewModel::onClearFilters,
                    )
                }

                if (state.isSearching) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (state.error != null) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = localizedError(state.error) ?: "",
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(24.dp),
                        )
                    }
                } else if (state.category == SearchCategory.ALL) {
                    AllModeSections(state = state, onCategorySelect = viewModel::onCategorySelect, callbacks = resultCallbacks)
                } else {
                    SingleCategoryResults(state = state, onLoadMore = viewModel::loadMore, callbacks = resultCallbacks)
                }
            }
        }
    }

    val postId = reportingPostId
    if (postId != null) {
        ReportDialog(
            isSubmitting = isSubmittingReport,
            error = reportError,
            onDismiss = { reportingPostId = null },
            onSubmit = { reason, details ->
                isSubmittingReport = true
                viewModel.reportPost(postId, reason, details) { result ->
                    isSubmittingReport = false
                    result
                        .onSuccess { reportingPostId = null }
                        .onFailure { reportError = it.message }
                }
            },
        )
    }

    val deletePostId = deletingPostId
    if (deletePostId != null) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingPost) deletingPostId = null },
            title = { Text(stringResource(R.string.post_delete_confirm_title)) },
            text = { Text(stringResource(R.string.post_delete_confirm_body)) },
            confirmButton = {
                if (isDeletingPost) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingPost = true
                        viewModel.deletePost(deletePostId) { result ->
                            isDeletingPost = false
                            deletingPostId = null
                            result.onFailure { /* left visible; the row itself still shows the post on failure */ }
                        }
                    }) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingPostId = null }, enabled = !isDeletingPost) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    val editPostId = editingPostId
    val editPostContent = state.posts.find { it.id == editPostId }?.content
    if (editPostId != null && editPostContent != null) {
        EditPostDialog(
            initialContent = editPostContent,
            isSubmitting = isSubmittingEdit,
            error = editError,
            title = stringResource(R.string.post_edit_dialog_title),
            onDismiss = { editingPostId = null },
            onSubmit = { content ->
                isSubmittingEdit = true
                viewModel.editPost(editPostId, content) { result ->
                    isSubmittingEdit = false
                    result
                        .onSuccess { editingPostId = null }
                        .onFailure { editError = it.message }
                }
            },
        )
    }
}

// Bundles every result-row callback so AllModeSections/SingleCategoryResults
// (and their per-category row composables) don't each need a 15+ parameter
// list of their own.
private class SearchResultCallbacks(
    val onAuthorClick: (String) -> Unit,
    val onOpenHashtag: (String) -> Unit,
    val onOpenCommunity: (String) -> Unit,
    val onOpenNewsArticle: (String) -> Unit,
    val onOpenListing: (String) -> Unit,
    val onOpenOpportunityListing: (String) -> Unit,
    val onOpenMusicArtist: (String) -> Unit,
    val onOpenMusicAlbum: (String) -> Unit,
    val onOpenMusicPlaylist: (String) -> Unit,
    val onLikeClick: (String) -> Unit,
    val onCommentClick: (String) -> Unit,
    val onOpenPost: (String) -> Unit,
    val onRepostClick: (String) -> Unit,
    val onBookmarkClick: (String) -> Unit,
    val onReportClick: (String) -> Unit,
    val onDeleteClick: (String) -> Unit,
    val onEditClick: (String) -> Unit,
    val onQuoteClick: (String) -> Unit,
    val onViewReposts: (String) -> Unit,
    val onViewQuotes: (String) -> Unit,
    val onOpenVideoViewer: (String) -> Unit,
    val onVoteClick: (postId: String, pollId: String, optionIndex: Int) -> Unit,
)

@Composable
private fun categoryLabel(category: SearchCategory): String = stringResource(
    when (category) {
        SearchCategory.ALL -> R.string.search_category_all
        SearchCategory.PEOPLE -> R.string.search_category_people
        SearchCategory.POSTS -> R.string.search_category_posts
        SearchCategory.HASHTAGS -> R.string.search_category_hashtags
        SearchCategory.COMMUNITIES -> R.string.nav_communities
        SearchCategory.NEWS -> R.string.nav_news
        SearchCategory.MUSIC -> R.string.nav_music
        SearchCategory.OPPORTUNITIES -> R.string.nav_opportunity
        SearchCategory.MARKETPLACE -> R.string.nav_marketplace
    },
)

@Composable
private fun sortLabel(sort: SearchSort): String = stringResource(
    when (sort) {
        SearchSort.RELEVANCE -> R.string.search_sort_relevance
        SearchSort.RECENT -> R.string.search_sort_recent
        SearchSort.ENGAGEMENT -> R.string.search_sort_engagement
        SearchSort.TRENDING -> R.string.search_sort_trending
    },
)

@Composable
private fun dateRangeLabel(range: SearchDateRange): String = stringResource(
    when (range) {
        SearchDateRange.ANY -> R.string.search_date_any
        SearchDateRange.LAST_24H -> R.string.search_date_24h
        SearchDateRange.LAST_7D -> R.string.search_date_7d
        SearchDateRange.LAST_30D -> R.string.search_date_30d
        SearchDateRange.CUSTOM -> R.string.search_date_custom
    },
)

@Composable
private fun mediaLabel(media: SearchMediaFilter?): String = if (media == null) {
    stringResource(R.string.search_media_all)
} else {
    stringResource(
        when (media) {
            SearchMediaFilter.IMAGE -> R.string.search_media_image
            SearchMediaFilter.VIDEO -> R.string.search_media_video
            SearchMediaFilter.GIF -> R.string.search_media_gif
            SearchMediaFilter.POLL -> R.string.search_media_poll
            SearchMediaFilter.NONE -> R.string.search_media_none
        },
    )
}

@Composable
private fun CategoryTabsRow(selected: SearchCategory, onSelect: (SearchCategory) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(SearchCategory.entries.toList(), key = { it.name }) { category ->
            FilterChip(
                selected = selected == category,
                onClick = { onSelect(category) },
                label = { Text(categoryLabel(category)) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SortAndFiltersRow(
    sort: SearchSort,
    filtersActive: Boolean,
    showFilters: Boolean,
    onSortSelect: (SearchSort) -> Unit,
    onToggleFilters: () -> Unit,
) {
    var sortMenuExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            TextButton(onClick = { sortMenuExpanded = true }) {
                Text("${stringResource(R.string.search_sort)}: ${sortLabel(sort)}")
            }
            androidx.compose.material3.DropdownMenu(expanded = sortMenuExpanded, onDismissRequest = { sortMenuExpanded = false }) {
                SearchSort.entries.forEach { option ->
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text(sortLabel(option)) },
                        onClick = { onSortSelect(option); sortMenuExpanded = false },
                    )
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        FilterChip(
            selected = showFilters || filtersActive,
            onClick = onToggleFilters,
            leadingIcon = { Icon(Icons.Filled.Tune, contentDescription = null, modifier = Modifier.size(18.dp)) },
            label = { Text(stringResource(R.string.search_filters)) },
        )
    }
}

@Composable
private fun FiltersPanel(
    category: SearchCategory,
    filters: SearchFilters,
    onChange: (SearchFilters) -> Unit,
    onClear: () -> Unit,
) {
    // language/country/verified/professional/creator only apply where
    // the backend actually filters on a person (People/Posts/
    // Opportunities/Marketplace, or "All" mode which fans out to all of
    // them) - see src/lib/search/types.ts's own field docs. Media only
    // applies to Posts. Matches the web page's own per-category filter
    // visibility exactly rather than showing controls that silently do
    // nothing for the current category.
    val showPersonFilters = category == SearchCategory.ALL || category == SearchCategory.PEOPLE ||
        category == SearchCategory.POSTS || category == SearchCategory.OPPORTUNITIES || category == SearchCategory.MARKETPLACE
    val showMedia = category == SearchCategory.ALL || category == SearchCategory.POSTS

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(stringResource(R.string.search_date_range), style = MaterialTheme.typography.labelLarge)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
            items(SearchDateRange.entries.toList(), key = { it.name }) { range ->
                FilterChip(
                    selected = filters.dateRange == range,
                    onClick = { onChange(filters.copy(dateRange = range)) },
                    label = { Text(dateRangeLabel(range)) },
                )
            }
        }

        if (filters.dateRange == SearchDateRange.CUSTOM) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = filters.dateFrom ?: "",
                    onValueChange = { onChange(filters.copy(dateFrom = it.ifBlank { null })) },
                    label = { Text(stringResource(R.string.search_date_from)) },
                    placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = filters.dateTo ?: "",
                    onValueChange = { onChange(filters.copy(dateTo = it.ifBlank { null })) },
                    label = { Text(stringResource(R.string.search_date_to)) },
                    placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (showMedia) {
            Text(
                stringResource(R.string.search_media),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(top = 8.dp),
            )
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                item {
                    FilterChip(
                        selected = filters.media == null,
                        onClick = { onChange(filters.copy(media = null)) },
                        label = { Text(mediaLabel(null)) },
                    )
                }
                items(SearchMediaFilter.entries.toList(), key = { it.name }) { option ->
                    FilterChip(
                        selected = filters.media == option,
                        onClick = { onChange(filters.copy(media = option)) },
                        label = { Text(mediaLabel(option)) },
                    )
                }
            }
        }

        if (showPersonFilters) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = filters.language ?: "",
                    onValueChange = { onChange(filters.copy(language = it.ifBlank { null })) },
                    label = { Text(stringResource(R.string.search_language)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = filters.country ?: "",
                    onValueChange = { onChange(filters.copy(country = it.ifBlank { null })) },
                    label = { Text(stringResource(R.string.search_country)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }

            FilterToggleRow(
                label = stringResource(R.string.search_verified),
                checked = filters.verified,
                onCheckedChange = { onChange(filters.copy(verified = it)) },
            )
            FilterToggleRow(
                label = stringResource(R.string.search_professional),
                checked = filters.professional,
                onCheckedChange = { onChange(filters.copy(professional = it)) },
            )
            FilterToggleRow(
                label = stringResource(R.string.search_creator),
                checked = filters.creator,
                onCheckedChange = { onChange(filters.copy(creator = it)) },
            )
        }

        if (filters.isActive) {
            TextButton(onClick = onClear, modifier = Modifier.padding(top = 4.dp)) {
                Text(stringResource(R.string.search_clear_filters))
            }
        }
    }
}

@Composable
private fun FilterToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

// Tracks whether the list is near its end (within 3 items), to trigger
// loadMore() the same way OpportunityHomePage/MarketplaceHomePage's own
// infinite-scroll lists do.
@Composable
private fun rememberShouldLoadMore(listState: LazyListState, itemCount: Int): Boolean {
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            itemCount > 0 && lastVisible >= itemCount - 3
        }
    }
    return shouldLoadMore
}

@Composable
private fun LoadMoreEffect(listState: LazyListState, itemCount: Int, onLoadMore: () -> Unit) {
    val shouldLoadMore = rememberShouldLoadMore(listState, itemCount)
    androidx.compose.runtime.LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) onLoadMore()
    }
}

@Composable
private fun LoadMoreFooter(isLoadingMore: Boolean) {
    if (isLoadingMore) {
        Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp))
        }
    }
}

@Composable
private fun SingleCategoryResults(state: SearchUiState, onLoadMore: () -> Unit, callbacks: SearchResultCallbacks) {
    val listState = rememberLazyListState()

    when (state.category) {
        SearchCategory.ALL -> Unit
        SearchCategory.PEOPLE -> {
            LoadMoreEffect(listState, state.users.size, onLoadMore)
            if (state.users.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_users))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(state.users, key = { it.id }) { user ->
                        SearchUserRow(user = user, onClick = { callbacks.onAuthorClick(user.username) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.POSTS -> {
            LoadMoreEffect(listState, state.posts.size, onLoadMore)
            if (state.posts.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_posts))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                        PostCard(
                            post = post,
                            onLikeClick = callbacks.onLikeClick,
                            onCommentClick = callbacks.onCommentClick,
                            onRepostClick = callbacks.onRepostClick,
                            onBookmarkClick = callbacks.onBookmarkClick,
                            onReportClick = callbacks.onReportClick,
                            isOwnPost = state.ownUserId != null && post.author.id == state.ownUserId,
                            onDeleteClick = callbacks.onDeleteClick,
                            onEditClick = callbacks.onEditClick,
                            onQuoteClick = callbacks.onQuoteClick,
                            onViewReposts = callbacks.onViewReposts,
                            onViewQuotes = callbacks.onViewQuotes,
                            onClick = callbacks.onCommentClick,
                            onQuotedPostClick = callbacks.onOpenPost,
                            onAuthorClick = callbacks.onAuthorClick,
                            onHashtagClick = callbacks.onOpenHashtag,
                            onOpenVideoViewer = callbacks.onOpenVideoViewer,
                            onVoteClick = callbacks.onVoteClick,
                        )
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.HASHTAGS -> {
            LoadMoreEffect(listState, state.hashtags.size, onLoadMore)
            if (state.hashtags.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_hashtags))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(state.hashtags, key = { it.tag }) { hashtag ->
                        HashtagResultRow(tag = hashtag.tag, count = hashtag.count, onClick = { callbacks.onOpenHashtag(hashtag.tag) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.COMMUNITIES -> {
            LoadMoreEffect(listState, state.communities.size, onLoadMore)
            if (state.communities.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_communities))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(state.communities, key = { it.id }) { community ->
                        CommunityResultRow(community = community, onClick = { callbacks.onOpenCommunity(community.id) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.NEWS -> {
            LoadMoreEffect(listState, state.news.size, onLoadMore)
            if (state.news.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_news))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(state.news, key = { it.id }) { article ->
                        NewsResultRow(article = article, onClick = { callbacks.onOpenNewsArticle(article.slug) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.MUSIC -> {
            LoadMoreEffect(listState, state.music.size, onLoadMore)
            if (state.music.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_music))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(state.music, key = { "${it.kind}:${it.id}" }) { item ->
                        MusicResultRow(
                            item = item,
                            onClick = {
                                when (item.kind) {
                                    "artist" -> callbacks.onOpenMusicArtist(item.id)
                                    "album" -> callbacks.onOpenMusicAlbum(item.id)
                                    "track" -> item.artist?.id?.let(callbacks.onOpenMusicArtist)
                                    "playlist" -> callbacks.onOpenMusicPlaylist(item.id)
                                }
                            },
                        )
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.OPPORTUNITIES -> {
            LoadMoreEffect(listState, state.opportunities.size, onLoadMore)
            if (state.opportunities.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_opportunities))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.opportunities, key = { it.id }) { listing ->
                        OpportunityCardView(listing = listing, onClick = { callbacks.onOpenOpportunityListing(listing.id) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
        SearchCategory.MARKETPLACE -> {
            LoadMoreEffect(listState, state.marketplace.size, onLoadMore)
            if (state.marketplace.isEmpty()) {
                EmptyState(stringResource(R.string.search_no_marketplace))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.marketplace, key = { it.id }) { listing ->
                        ListingCardView(listing = listing, onClick = { callbacks.onOpenListing(listing.id) })
                    }
                    item { LoadMoreFooter(state.isLoadingMore) }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = message, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
    }
}

// type=all's teaser layout: one section per category, each capped
// server-side (see ALL_MODE_LIMITS in src/app/api/search/route.ts), with
// a "See all" link that switches into that category's own full paginated
// list - the same split the web page's AllModeSections/
// SingleCategoryResults components make.
@Composable
private fun AllModeSections(state: SearchUiState, onCategorySelect: (SearchCategory) -> Unit, callbacks: SearchResultCallbacks) {
    val hasAnyResults = state.users.isNotEmpty() || state.posts.isNotEmpty() || state.hashtags.isNotEmpty() ||
        state.communities.isNotEmpty() || state.news.isNotEmpty() || state.music.isNotEmpty() ||
        state.opportunities.isNotEmpty() || state.marketplace.isNotEmpty()

    if (!hasAnyResults) {
        EmptyState(stringResource(R.string.search_no_results))
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        if (state.users.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.PEOPLE), onSeeAllClick = { onCategorySelect(SearchCategory.PEOPLE) }) }
            items(state.users, key = { "u:${it.id}" }) { user -> SearchUserRow(user = user, onClick = { callbacks.onAuthorClick(user.username) }) }
        }
        if (state.posts.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.POSTS), onSeeAllClick = { onCategorySelect(SearchCategory.POSTS) }) }
            itemsIndexed(state.posts, key = { _, post -> "p:${post.id}" }) { _, post ->
                PostCard(
                    post = post,
                    onLikeClick = callbacks.onLikeClick,
                    onCommentClick = callbacks.onCommentClick,
                    onRepostClick = callbacks.onRepostClick,
                    onBookmarkClick = callbacks.onBookmarkClick,
                    onReportClick = callbacks.onReportClick,
                    isOwnPost = state.ownUserId != null && post.author.id == state.ownUserId,
                    onDeleteClick = callbacks.onDeleteClick,
                    onEditClick = callbacks.onEditClick,
                    onQuoteClick = callbacks.onQuoteClick,
                    onViewReposts = callbacks.onViewReposts,
                    onViewQuotes = callbacks.onViewQuotes,
                    onClick = callbacks.onCommentClick,
                    onQuotedPostClick = callbacks.onOpenPost,
                    onAuthorClick = callbacks.onAuthorClick,
                    onHashtagClick = callbacks.onOpenHashtag,
                    onOpenVideoViewer = callbacks.onOpenVideoViewer,
                    onVoteClick = callbacks.onVoteClick,
                )
            }
        }
        if (state.hashtags.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.HASHTAGS), onSeeAllClick = { onCategorySelect(SearchCategory.HASHTAGS) }) }
            items(state.hashtags, key = { "h:${it.tag}" }) { hashtag -> HashtagResultRow(tag = hashtag.tag, count = hashtag.count, onClick = { callbacks.onOpenHashtag(hashtag.tag) }) }
        }
        if (state.communities.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.COMMUNITIES), onSeeAllClick = { onCategorySelect(SearchCategory.COMMUNITIES) }) }
            items(state.communities, key = { "c:${it.id}" }) { community -> CommunityResultRow(community = community, onClick = { callbacks.onOpenCommunity(community.id) }) }
        }
        if (state.news.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.NEWS), onSeeAllClick = { onCategorySelect(SearchCategory.NEWS) }) }
            items(state.news, key = { "n:${it.id}" }) { article -> NewsResultRow(article = article, onClick = { callbacks.onOpenNewsArticle(article.slug) }) }
        }
        if (state.music.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.MUSIC), onSeeAllClick = { onCategorySelect(SearchCategory.MUSIC) }) }
            items(state.music, key = { "m:${it.kind}:${it.id}" }) { item ->
                MusicResultRow(
                    item = item,
                    onClick = {
                        when (item.kind) {
                            "artist" -> callbacks.onOpenMusicArtist(item.id)
                            "album" -> callbacks.onOpenMusicAlbum(item.id)
                            "track" -> item.artist?.id?.let(callbacks.onOpenMusicArtist)
                            "playlist" -> callbacks.onOpenMusicPlaylist(item.id)
                        }
                    },
                )
            }
        }
        if (state.opportunities.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.OPPORTUNITIES), onSeeAllClick = { onCategorySelect(SearchCategory.OPPORTUNITIES) }) }
            items(state.opportunities, key = { "o:${it.id}" }) { listing ->
                Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    OpportunityCardView(listing = listing, onClick = { callbacks.onOpenOpportunityListing(listing.id) })
                }
            }
        }
        if (state.marketplace.isNotEmpty()) {
            item { SectionHeaderWithSeeAll(title = categoryLabel(SearchCategory.MARKETPLACE), onSeeAllClick = { onCategorySelect(SearchCategory.MARKETPLACE) }) }
            items(state.marketplace, key = { "mp:${it.id}" }) { listing ->
                Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    ListingCardView(listing = listing, onClick = { callbacks.onOpenListing(listing.id) })
                }
            }
        }
    }
}

@Composable
private fun HashtagResultRow(tag: String, count: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Tag, contentDescription = null, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = "#$tag", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(text = "$count", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CommunityResultRow(community: CommunitySummary, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = community.iconUrl, name = community.name, size = 44.dp)
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = community.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = community.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun NewsResultRow(article: NewsArticleSummary, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Newspaper, contentDescription = null, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = article.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!article.sourceName.isNullOrBlank()) {
                Text(text = article.sourceName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MusicResultRow(item: SearchMusicResult, onClick: () -> Unit) {
    val (title, subtitle) = when (item.kind) {
        "artist" -> (item.displayName ?: "") to null
        "album" -> (item.title ?: "") to item.artist?.displayName
        "track" -> (item.title ?: "") to item.artist?.displayName
        "playlist" -> (item.name ?: "") to null
        else -> "" to null
    }
    val imageUrl = item.avatarUrl ?: item.coverUrl ?: item.artist?.avatarUrl

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (imageUrl != null) {
            Avatar(url = imageUrl, name = title, size = 44.dp)
        } else {
            Icon(Icons.Filled.MusicNote, contentDescription = null, modifier = Modifier.size(44.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (item.verified) VerifiedBadge(badgeType = "verified")
            }
            if (subtitle != null) {
                Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun DiscoverContent(
    state: SearchUiState,
    onAuthorClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
    onOpenMusic: () -> Unit,
    onOpenMarketplace: () -> Unit,
    onOpenOpportunity: () -> Unit,
    onOpenAid: () -> Unit,
    onOpenPlay: () -> Unit,
    onOpenNews: () -> Unit,
    onOpenShorts: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenTrending: () -> Unit,
    onOpenExplorePeople: () -> Unit,
) {
    if (state.isLoadingDiscover) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        // Previously these 8 rows opened directly with no heading at all -
        // immediately followed by the Trending/Who-to-follow sections,
        // which DO have their own headers - so nothing signalled that
        // Music, Marketplace, a job board, a charity flow, games, News,
        // Shorts and an AI chatbot all live behind the Search tab. This
        // is the actual "menu is too complicated" complaint: not tap
        // depth (most things are 1-2 taps away already), but zero
        // labeling of what's here.
        item {
            DiscoverSectionHeader()
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.MusicNote,
                label = stringResource(R.string.home_discover_music),
                onClick = onOpenMusic,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.ShoppingCart,
                label = stringResource(R.string.marketplace_discover_entry),
                onClick = onOpenMarketplace,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.Work,
                label = stringResource(R.string.opportunity_discover_entry),
                onClick = onOpenOpportunity,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.VolunteerActivism,
                label = stringResource(R.string.aid_discover_entry),
                onClick = onOpenAid,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.SportsEsports,
                label = stringResource(R.string.play_discover_entry),
                onClick = onOpenPlay,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.Newspaper,
                label = stringResource(R.string.news_discover_entry),
                onClick = onOpenNews,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.SmartDisplay,
                label = stringResource(R.string.shorts_discover_entry),
                onClick = onOpenShorts,
            )
        }
        item {
            DiscoverEntryRow(
                icon = Icons.Filled.AutoAwesome,
                label = stringResource(R.string.ai_discover_entry),
                onClick = onOpenAi,
            )
        }

        if (state.trendingHashtags.isNotEmpty()) {
            item {
                SectionHeaderWithSeeAll(
                    title = stringResource(R.string.home_trending_on_zrp),
                    onSeeAllClick = onOpenTrending,
                )
            }
            item {
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.trendingHashtags, key = { it.tag }) { hashtag ->
                        HashtagChip(tag = hashtag.tag, onClick = { onHashtagClick(hashtag.tag) })
                    }
                }
            }
        }

        if (state.suggestedUsers.isNotEmpty()) {
            item {
                SectionHeaderWithSeeAll(
                    title = stringResource(R.string.right_panel_who_to_follow),
                    onSeeAllClick = onOpenExplorePeople,
                )
            }
            items(state.suggestedUsers, key = { it.id }) { user ->
                SearchUserRow(user = user, onClick = { onAuthorClick(user.username) })
            }
        }
    }
}

@Composable
private fun SearchUserRow(user: SearchUser, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 44.dp)

        Spacer(modifier = Modifier.width(12.dp))

        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = user.name ?: user.username,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = user.badgeType)
            }
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// One shared row for all 8 Discover feature-vertical entries (previously
// 8 near-identical composables). Adds a trailing chevron matching
// SettingsRow's own affordance - these rows navigate away from Search
// exactly like a Settings row navigates away from Settings, so they
// should signal that the same way.
@Composable
private fun DiscoverEntryRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// Matches HomeTrending.tsx/HomeCreatorsRow.tsx's own section-header +
// "See all" link pairing exactly - both compact Discover teasers get
// the same click-through to their real full-list page.
// Sits above the 8 feature-vertical entry rows (Music/Marketplace/
// Opportunity/Aid/Play/News/Shorts/AI) so they read as a distinct,
// labeled group rather than blending into whatever comes above or
// below them on this tab.
@Composable
private fun DiscoverSectionHeader() {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            text = stringResource(R.string.search_discover_section_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = stringResource(R.string.search_discover_section_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SectionHeaderWithSeeAll(title: String, onSeeAllClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        TextButton(onClick = onSeeAllClick) {
            Text(stringResource(R.string.home_see_all))
        }
    }
}

@Composable
private fun HashtagChip(tag: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Text(
            text = "#$tag",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}
