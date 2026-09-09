package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.components.Avatar

/**
 * The multi-select "pick real users" field shared by group creation
 * (GroupCreateScreen) and adding members to an existing group
 * (GroupParticipantsScreen) - the same real GET /search?type=users this
 * app's people search already uses (already excludes blocked/muted
 * users server-side - see SearchApi's own KDoc), never a client-side
 * invented user list. Selected chips live above the search field;
 * [excludeUserIds] additionally hides anyone already a real participant
 * (the add-members flow) so they can't be "added" a second time.
 */
@Composable
fun UserMultiSelectField(
    selectedUsers: List<SearchUser>,
    onSelectedChange: (List<SearchUser>) -> Unit,
    excludeUserIds: Set<String> = emptySet(),
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<SearchUser>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    val repository = remember { SearchRepository() }

    LaunchedEffect(query) {
        if (query.trim().length < 2) {
            results = emptyList()
            isSearching = false
            return@LaunchedEffect
        }
        isSearching = true
        delay(300) // debounce, matching SearchViewModel's own real-search convention
        repository.searchUsers(query.trim())
            .onSuccess { results = it }
            .onFailure { results = emptyList() }
        isSearching = false
    }

    val selectedIds = remember(selectedUsers) { selectedUsers.map { it.id }.toSet() }

    Column(modifier = modifier) {
        if (selectedUsers.isNotEmpty()) {
            LazyColumn(modifier = Modifier.fillMaxWidth().height((selectedUsers.size.coerceAtMost(4) * 48).dp)) {
                items(selectedUsers, key = { it.id }) { user ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelectedChange(selectedUsers.filterNot { it.id == user.id }) }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 32.dp)
                            Text(
                                text = user.name ?: user.username,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                        Icon(Icons.Filled.Cancel, contentDescription = stringResource(R.string.group_remove_selected_cd))
                    }
                }
            }
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(stringResource(R.string.group_search_people_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = { if (isSearching) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        val visibleResults = results.filter { it.id !in selectedIds && it.id !in excludeUserIds }
        if (visibleResults.isNotEmpty()) {
            LazyColumn(modifier = Modifier.fillMaxWidth().height(240.dp)) {
                items(visibleResults, key = { it.id }) { user ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onSelectedChange(selectedUsers + user)
                                query = ""
                                results = emptyList()
                            }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 36.dp)
                        Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                            Text(
                                text = user.name ?: user.username,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "@${user.username}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        } else if (query.trim().length >= 2 && !isSearching) {
            Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.group_search_people_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
