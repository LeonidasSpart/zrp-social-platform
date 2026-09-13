package one.zrp.social.mobile.ui.communities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

@Composable
fun CommunityDetailScreen(
    communityId: String,
    onBack: () -> Unit,
    onAuthorClick: (String) -> Unit,
    onOpenComments: (String) -> Unit,
    onOpenHashtag: (String) -> Unit = {},
    onOpenQuotePost: (String) -> Unit = {},
    onOpenReposts: (String) -> Unit = {},
    onOpenQuotes: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
) {
    val viewModel: CommunityDetailViewModel = viewModel(
        key = communityId,
        factory = remember { CommunityDetailViewModelFactory(communityId, CommunitiesRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var reportingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingReport by remember { mutableStateOf(false) }
    var reportError by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = state.community?.name ?: stringResource(R.string.nav_communities),
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                modifier = Modifier.weight(1f, fill = false).padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            }
            state.notFound || state.community == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.communities_detail_not_found), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> {
                val community = state.community!!
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
                            Text(text = community.description, style = MaterialTheme.typography.bodyMedium)
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Filled.Groups, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 4.dp))
                                Text(
                                    text = pluralStringResource(R.plurals.communities_member_count, community.memberCount, community.memberCount),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Icon(Icons.Filled.Tag, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = Spacing.md, end = 2.dp))
                                Text(
                                    text = community.hashtag,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (state.myRole == "OWNER") {
                                    Surface(color = ZrpRed.copy(alpha = 0.12f), modifier = Modifier.padding(start = Spacing.md)) {
                                        Text(
                                            text = stringResource(R.string.communities_detail_owner_badge),
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = ZrpRed,
                                            modifier = Modifier.padding(horizontal = Spacing.sm, vertical = 2.dp),
                                        )
                                    }
                                }
                                Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                                    if (state.isMember) {
                                        OutlinedButton(onClick = viewModel::toggleMembership) {
                                            Text(stringResource(R.string.communities_joined))
                                        }
                                    } else {
                                        Button(onClick = viewModel::toggleMembership) {
                                            Text(stringResource(R.string.communities_join))
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
                                    Text(
                                        text = stringResource(R.string.communities_detail_feed_empty_title),
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = stringResource(R.string.communities_detail_feed_empty_body, community.hashtag),
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
