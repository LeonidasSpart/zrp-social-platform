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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.Work
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.home.PostCard

/**
 * The Search tab: real typed search against the website's own /search
 * endpoint, plus a pre-search "Discover" state built from the same
 * suggested-users/trending-hashtags endpoints the Home feed's widgets
 * already use. No fake results, no separate search index.
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
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
    onOpenTrending: () -> Unit = {},
    onOpenExplorePeople: () -> Unit = {},
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
            SearchResultsContent(
                state = state,
                onAuthorClick = onAuthorClick,
                onOpenHashtag = onOpenHashtag,
                onLikeClick = { postId -> viewModel.toggleLike(postId) },
                onCommentClick = onOpenComments,
                onRepostClick = { postId -> viewModel.toggleRepost(postId) },
                onBookmarkClick = { postId -> viewModel.toggleBookmark(postId) },
                onReportClick = { postId ->
                    reportingPostId = postId
                    reportError = null
                },
                onDeleteClick = { postId -> deletingPostId = postId },
                onEditClick = { postId ->
                    editingPostId = postId
                    editError = null
                },
                onQuoteClick = onOpenQuotePost,
                onViewReposts = onOpenReposts,
                onViewQuotes = onOpenQuotes,
                onOpenVideoViewer = onOpenVideoViewer,
                onVoteClick = { postId, pollId, optionIndex -> viewModel.votePoll(postId, pollId, optionIndex) },
            )
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
private fun SearchResultsContent(
    state: SearchUiState,
    onAuthorClick: (String) -> Unit,
    onOpenHashtag: (String) -> Unit,
    onLikeClick: (String) -> Unit,
    onCommentClick: (String) -> Unit,
    onRepostClick: (String) -> Unit,
    onBookmarkClick: (String) -> Unit,
    onReportClick: (String) -> Unit,
    onDeleteClick: (String) -> Unit,
    onEditClick: (String) -> Unit,
    onQuoteClick: (String) -> Unit,
    onViewReposts: (String) -> Unit,
    onViewQuotes: (String) -> Unit,
    onOpenVideoViewer: (String) -> Unit,
    onVoteClick: (postId: String, pollId: String, optionIndex: Int) -> Unit,
) {
    if (state.isSearching) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (state.error != null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = state.error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }

    // Always shows both sections with their real counts and per-section
    // empty copy (search.usersTab/noUsers, search.postsTab/noPosts) -
    // matching the website's own /search page, which keeps both tabs
    // visible (e.g. "Users (0)") rather than hiding a section outright
    // when only the other type matched.
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            Text(
                text = stringResource(R.string.search_users_tab, state.users.size),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
        if (state.users.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.search_no_users),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        } else {
            items(state.users, key = { it.id }) { user ->
                SearchUserRow(user = user, onClick = { onAuthorClick(user.username) })
            }
        }

        item {
            Text(
                text = stringResource(R.string.search_posts_tab, state.posts.size),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
        if (state.posts.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.search_no_posts),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        } else {
            itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                PostCard(
                    post = post,
                    onLikeClick = onLikeClick,
                    onCommentClick = onCommentClick,
                    onRepostClick = onRepostClick,
                    onBookmarkClick = onBookmarkClick,
                    onReportClick = onReportClick,
                    isOwnPost = state.ownUserId != null && post.author.id == state.ownUserId,
                    onDeleteClick = onDeleteClick,
                    onEditClick = onEditClick,
                    onQuoteClick = onQuoteClick,
                    onViewReposts = onViewReposts,
                    onViewQuotes = onViewQuotes,
                    onClick = onCommentClick,
                    onAuthorClick = onAuthorClick,
                    onHashtagClick = onOpenHashtag,
                    onOpenVideoViewer = onOpenVideoViewer,
                    onVoteClick = onVoteClick,
                )
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
