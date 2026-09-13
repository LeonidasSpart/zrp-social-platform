package one.zrp.social.mobile.ui.lists

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ListsRepository
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.Spacing

@Composable
fun ListDetailScreen(
    listId: String,
    onBack: () -> Unit,
    onAuthorClick: (String) -> Unit,
    onOpenComments: (String) -> Unit,
    onOpenHashtag: (String) -> Unit = {},
    onOpenQuotePost: (String) -> Unit = {},
    onOpenReposts: (String) -> Unit = {},
    onOpenQuotes: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
) {
    val viewModel: ListDetailViewModel = viewModel(
        key = listId,
        factory = remember { ListDetailViewModelFactory(listId, ListsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var addUsername by remember { mutableStateOf("") }
    var confirmingDelete by remember { mutableStateOf(false) }
    var reportingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingReport by remember { mutableStateOf(false) }
    var reportError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.deleted) { if (state.deleted) onBack() }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f, fill = false).padding(start = 4.dp)) {
                Text(text = state.list?.name ?: stringResource(R.string.nav_lists), style = MaterialTheme.typography.titleMedium, maxLines = 1)
                if (state.list?.isPrivate == true) {
                    Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.padding(start = 6.dp).size(16.dp))
                }
            }
            if (state.isOwner) {
                IconButton(onClick = { confirmingDelete = true }) {
                    Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.lists_detail_delete_button), tint = MaterialTheme.colorScheme.error)
                }
            }
        }
        HorizontalDivider()

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            }
            state.notFound -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.lists_detail_not_found), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            state.forbidden || state.list == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            text = stringResource(R.string.lists_detail_private_notice),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    }
                }
            }
            else -> {
                val list = state.list!!
                val listState = rememberLazyListState()
                val shouldLoadMore by remember {
                    derivedStateOf {
                        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                        val totalItems = listState.layoutInfo.totalItemsCount
                        totalItems > 0 && lastVisible >= totalItems - 3
                    }
                }
                LaunchedEffect(shouldLoadMore) { if (shouldLoadMore) viewModel.loadMoreFeed() }

                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    item {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            if (!list.description.isNullOrBlank()) {
                                Text(text = list.description, style = MaterialTheme.typography.bodyMedium)
                            }

                            if (state.isOwner) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                                ) {
                                    OutlinedTextField(
                                        value = addUsername,
                                        onValueChange = { addUsername = it },
                                        placeholder = { Text(stringResource(R.string.lists_detail_add_member_placeholder)) },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                    )
                                    if (state.isAddingMember) {
                                        CircularProgressIndicator(modifier = Modifier.padding(start = Spacing.sm).size(24.dp))
                                    } else {
                                        Button(
                                            onClick = {
                                                viewModel.addMember(addUsername.trim()) { result ->
                                                    result.onSuccess { addUsername = "" }
                                                }
                                            },
                                            enabled = addUsername.isNotBlank(),
                                            modifier = Modifier.padding(start = Spacing.sm),
                                        ) {
                                            Text(stringResource(R.string.lists_detail_add_member_button))
                                        }
                                    }
                                }
                                if (state.addMemberError != null) {
                                    Text(
                                        text = state.addMemberError!!,
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.bodySmall,
                                        modifier = Modifier.padding(top = Spacing.xs),
                                    )
                                }
                            }

                            Text(
                                text = "${stringResource(R.string.lists_detail_members_heading)} (${list.memberCount})",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.sm),
                            )
                            if (list.members.isEmpty()) {
                                Text(
                                    text = stringResource(R.string.lists_detail_empty_members),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            } else {
                                list.members.forEach { entry ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
                                    ) {
                                        AsyncImage(
                                            model = entry.user.avatarUrl,
                                            contentDescription = null,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.size(36.dp).clip(CircleShape),
                                        )
                                        Text(
                                            text = entry.user.name ?: entry.user.username,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                            modifier = Modifier.weight(1f, fill = false).padding(start = Spacing.sm),
                                        )
                                        if (state.isOwner) {
                                            Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                                                IconButton(onClick = { viewModel.removeMember(entry.user.id) }) {
                                                    Icon(
                                                        Icons.Filled.PersonRemove,
                                                        contentDescription = stringResource(R.string.lists_detail_remove_member_aria, entry.user.name ?: entry.user.username),
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        HorizontalDivider()
                    }

                    if (state.isFeedLoading) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        }
                    } else if (state.posts.isEmpty()) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(text = stringResource(R.string.lists_detail_feed_empty_title), fontWeight = FontWeight.Bold)
                                    Text(
                                        text = stringResource(R.string.lists_detail_feed_empty_body),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(top = Spacing.xs),
                                    )
                                }
                            }
                        }
                    } else {
                        itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                            PostCard(
                                post = post,
                                onLikeClick = viewModel::toggleLike,
                                onCommentClick = onOpenComments,
                                onRepostClick = viewModel::toggleRepost,
                                onBookmarkClick = viewModel::toggleBookmark,
                                onReportClick = { postId ->
                                    reportingPostId = postId
                                    reportError = null
                                },
                                onQuoteClick = onOpenQuotePost,
                                onViewReposts = onOpenReposts,
                                onViewQuotes = onOpenQuotes,
                                onClick = onOpenComments,
                                onAuthorClick = onAuthorClick,
                                onHashtagClick = onOpenHashtag,
                                onOpenVideoViewer = onOpenVideoViewer,
                                onVoteClick = { postId, pollId, optionIndex -> viewModel.votePoll(postId, pollId, optionIndex) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.lists_detail_delete_button)) },
            text = { Text(stringResource(R.string.lists_detail_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.deleteList { }
                }) {
                    Text(stringResource(R.string.lists_detail_delete_button), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.lists_create_cancel)) }
            },
        )
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
                    result.onSuccess { reportingPostId = null }.onFailure { reportError = it.message }
                }
            },
        )
    }
}
