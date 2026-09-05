package one.zrp.social.mobile.ui.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.PostsRepository

/**
 * The native Home screen: the same two real feed streams the website
 * exposes (For You / Following), fetched and paginated directly - no
 * WebView, no re-implemented ranking logic.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun HomeScreen() {
    val viewModel: HomeViewModel = viewModel(factory = HomeViewModelFactory(PostsRepository()))
    val activeTab by viewModel.activeTab.collectAsState()
    val forYouState by viewModel.forYouState.collectAsState()
    val followingState by viewModel.followingState.collectAsState()

    val state = if (activeTab == FeedTab.FOR_YOU) forYouState else followingState

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshing,
        onRefresh = { viewModel.refresh(activeTab) },
    )

    Box(modifier = Modifier.fillMaxSize()) {
        androidx.compose.foundation.layout.Column(modifier = Modifier.fillMaxSize()) {
            TabRow(selectedTabIndex = if (activeTab == FeedTab.FOR_YOU) 0 else 1) {
                Tab(
                    selected = activeTab == FeedTab.FOR_YOU,
                    onClick = { viewModel.selectTab(FeedTab.FOR_YOU) },
                    text = { Text("For You") },
                )
                Tab(
                    selected = activeTab == FeedTab.FOLLOWING,
                    onClick = { viewModel.selectTab(FeedTab.FOLLOWING) },
                    text = { Text("Following") },
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pullRefresh(pullRefreshState),
            ) {
                val listState = rememberLazyListState()

                val shouldLoadMore by remember {
                    derivedStateOf {
                        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                        val totalItems = listState.layoutInfo.totalItemsCount
                        totalItems > 0 && lastVisible >= totalItems - 3
                    }
                }

                LaunchedEffect(shouldLoadMore, activeTab) {
                    if (shouldLoadMore) {
                        viewModel.loadMore(activeTab)
                    }
                }

                if (state.error != null && state.posts.isEmpty()) {
                    Text(
                        text = state.error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                    )
                } else {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                            PostCard(
                                post = post,
                                onLikeClick = { postId -> viewModel.toggleLike(activeTab, postId) },
                                onClick = { /* Post detail screen lands in a later phase. */ },
                            )
                        }

                        if (state.isLoadingMore) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }

                PullRefreshIndicator(
                    refreshing = state.isRefreshing,
                    state = pullRefreshState,
                    modifier = Modifier.align(Alignment.TopCenter),
                )
            }
        }
    }
}
