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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.home.PostCard

/**
 * The Search tab: real typed search against the website's own /search
 * endpoint, plus a pre-search "Discover" state built from the same
 * suggested-users/trending-hashtags endpoints the Home feed's widgets
 * already use. No fake results, no separate search index.
 */
@Composable
fun SearchScreen(onAuthorClick: (String) -> Unit) {
    val viewModel: SearchViewModel = viewModel(factory = SearchViewModelFactory(SearchRepository()))
    val state by viewModel.state.collectAsState()

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
            )
        } else {
            SearchResultsContent(
                state = state,
                onAuthorClick = onAuthorClick,
                onLikeClick = { postId -> viewModel.toggleLike(postId) },
            )
        }
    }
}

@Composable
private fun DiscoverContent(
    state: SearchUiState,
    onAuthorClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
) {
    if (state.isLoadingDiscover) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
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
    onLikeClick: (String) -> Unit,
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
                    onClick = { /* Post detail screen lands in a later phase. */ },
                    onAuthorClick = onAuthorClick,
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
        if (user.avatarUrl != null) {
            AsyncImage(
                model = user.avatarUrl,
                contentDescription = user.username,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.Person,
                contentDescription = user.username,
                modifier = Modifier.size(44.dp),
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column {
            Text(
                text = user.name ?: user.username,
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
