package one.zrp.social.mobile.ui.search

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
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
    onOpenComments: (postId: String) -> Unit,
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
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
            placeholder = { Text("Search ZRP") },
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (state.query.isNotEmpty()) {
                    IconButton(onClick = { viewModel.onQueryChange("") }) {
                        Icon(Icons.Filled.Clear, contentDescription = "Clear")
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
            title = { Text("Delete post?") },
            text = { Text("This can't be undone.") },
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
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingPostId = null }, enabled = !isDeletingPost) {
                    Text("Cancel")
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
) {
    if (state.isLoadingDiscover) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            MusicEntryRow(onClick = onOpenMusic)
        }

        if (state.trendingHashtags.isNotEmpty()) {
            item {
                Text(
                    text = "Trending",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
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
                Text(
                    text = "Suggested for you",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
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
) {
    if (state.isSearching) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (state.users.isEmpty() && state.posts.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = state.error ?: "No results found.",
                color = if (state.error != null) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        if (state.users.isNotEmpty()) {
            item {
                Text(
                    text = "Users",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            items(state.users, key = { it.id }) { user ->
                SearchUserRow(user = user, onClick = { onAuthorClick(user.username) })
            }
        }

        if (state.posts.isNotEmpty()) {
            item {
                Text(
                    text = "Posts",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
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
            .clickable(onClick = onClick)
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
                )
                VerifiedBadge(badgeType = user.badgeType, modifier = Modifier.padding(start = 3.dp))
            }
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MusicEntryRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.MusicNote,
            contentDescription = null,
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(text = "ZRP Music", style = MaterialTheme.typography.titleSmall)
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
