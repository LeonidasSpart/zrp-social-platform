package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge

/** Ported from OpponentSearch.tsx: debounced GET /search?type=users lookup. */
@Composable
fun OpponentSearchView(
    repository: PlayRepository,
    value: SearchUser?,
    onChange: (SearchUser?) -> Unit,
    excludeUserId: String?,
) {
    if (value != null) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                .padding(12.dp),
        ) {
            Avatar(url = value.avatarUrl, name = value.username, size = 36.dp)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 10.dp),
            ) {
                Text(text = "@${value.username}", style = MaterialTheme.typography.labelLarge)
                VerifiedBadge(badgeType = value.badgeType)
            }
            IconButton(onClick = { onChange(null) }) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.play_select_opponent))
            }
        }
        return
    }

    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(emptyList<SearchUser>()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        if (query.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        loading = true
        delay(300)
        repository.searchOpponents(query.trim())
            .onSuccess { users -> results = users.filter { it.id != excludeUserId } }
            .onFailure { results = emptyList() }
        loading = false
    }

    Column {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(stringResource(R.string.play_search_users)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (loading || results.isNotEmpty()) {
            if (loading) {
                Box(modifier = Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.padding(4.dp))
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 240.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerLow),
                ) {
                    items(results, key = { it.id }) { user ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onChange(user)
                                    query = ""
                                    results = emptyList()
                                }
                                .padding(10.dp),
                        ) {
                            Avatar(url = user.avatarUrl, name = user.username, size = 32.dp)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(text = "@${user.username}", style = MaterialTheme.typography.bodyMedium)
                                VerifiedBadge(badgeType = user.badgeType)
                            }
                        }
                    }
                }
            }
        }
    }
}
