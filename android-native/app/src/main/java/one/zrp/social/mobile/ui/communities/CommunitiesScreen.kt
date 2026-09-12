package one.zrp.social.mobile.ui.communities

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.ui.theme.Spacing

@Composable
fun communityCategoryLabel(category: String): String = when (category) {
    "TRAVEL" -> stringResource(R.string.communities_category_travel)
    "PHOTOGRAPHY" -> stringResource(R.string.communities_category_photography)
    "NATURE" -> stringResource(R.string.communities_category_nature)
    "TECHNOLOGY" -> stringResource(R.string.communities_category_technology)
    "HEALTH_FITNESS" -> stringResource(R.string.communities_category_health_fitness)
    "ART_DESIGN" -> stringResource(R.string.communities_category_art_design)
    else -> stringResource(R.string.communities_category_general)
}

/**
 * Real, database-backed communities (browse/search/category filter,
 * create, join/leave) - replaces the earlier trending-hashtag reskin.
 * See prisma/schema.prisma's Community/CommunityMember models and
 * CommunitiesRepository's KDoc.
 */
@Composable
fun CommunitiesScreen(onBack: () -> Unit, onOpenCommunity: (String) -> Unit) {
    val viewModel: CommunitiesViewModel = viewModel(
        factory = remember { CommunitiesViewModelFactory(CommunitiesRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }

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
                text = stringResource(R.string.nav_communities),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            IconButton(onClick = { showCreate = true }) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.communities_create_button))
            }
        }
        HorizontalDivider()

        OutlinedTextField(
            value = state.search,
            onValueChange = viewModel::setSearch,
            placeholder = { Text(stringResource(R.string.communities_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.search() }),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )

        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                FilterChip(
                    selected = state.category == null,
                    onClick = { viewModel.setCategory(null) },
                    label = { Text(stringResource(R.string.communities_category_all)) },
                )
            }
            items(COMMUNITY_CATEGORIES, key = { it }) { category ->
                FilterChip(
                    selected = state.category == category,
                    onClick = { viewModel.setCategory(category) },
                    label = { Text(communityCategoryLabel(category)) },
                )
            }
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.communities.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = state.error ?: stringResource(R.string.communities_empty_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        if (state.error == null) {
                            Text(
                                text = stringResource(R.string.communities_empty_body),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )
                        }
                    }
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    items(state.communities, key = { it.id }) { community ->
                        CommunityCard(
                            community = community,
                            onClick = { onOpenCommunity(community.id) },
                            onToggleMembership = { viewModel.toggleMembership(community) },
                        )
                    }
                }
            }
        }
    }

    if (showCreate) {
        CreateCommunityDialog(
            isSubmitting = state.isCreating,
            error = state.createError,
            onDismiss = { showCreate = false },
            onSubmit = { name, description, category, hashtag ->
                viewModel.createCommunity(name, description, category, hashtag) { result ->
                    result.onSuccess {
                        showCreate = false
                        onOpenCommunity(it.id)
                    }
                }
            },
        )
    }
}

@Composable
private fun CommunityCard(
    community: CommunitySummary,
    onClick: () -> Unit,
    onToggleMembership: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                verticalAlignment = Alignment.Top,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onClick, role = Role.Button),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = community.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(
                        text = communityCategoryLabel(community.category),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = community.description,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 2,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Groups, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 4.dp))
                Text(
                    text = pluralStringResource(R.plurals.communities_member_count, community.memberCount, community.memberCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (community.isMember) {
                    OutlinedButton(onClick = onToggleMembership) {
                        Text(stringResource(R.string.communities_joined))
                    }
                } else {
                    Button(onClick = onToggleMembership) {
                        Text(stringResource(R.string.communities_join))
                    }
                }
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun CreateCommunityDialog(
    isSubmitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (name: String, description: String, category: String, hashtag: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("GENERAL") }
    var hashtag by remember { mutableStateOf("") }
    var categoryMenuExpanded by remember { mutableStateOf(false) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.communities_create_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.communities_create_name_label)) },
                    placeholder = { Text(stringResource(R.string.communities_create_name_placeholder)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text(stringResource(R.string.communities_create_description_label)) },
                    placeholder = { Text(stringResource(R.string.communities_create_description_placeholder)) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                ExposedDropdownMenuBox(
                    expanded = categoryMenuExpanded,
                    onExpandedChange = { categoryMenuExpanded = it },
                    modifier = Modifier.padding(top = Spacing.sm),
                ) {
                    OutlinedTextField(
                        value = communityCategoryLabel(category),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.communities_create_category_label)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth(),
                    )
                    DropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                        COMMUNITY_CATEGORIES.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(communityCategoryLabel(option)) },
                                onClick = {
                                    category = option
                                    categoryMenuExpanded = false
                                },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = hashtag,
                    onValueChange = { hashtag = it.filter { c -> c.isLetterOrDigit() || c == '_' }.lowercase() },
                    label = { Text(stringResource(R.string.communities_create_hashtag_label)) },
                    placeholder = { Text(stringResource(R.string.communities_create_hashtag_placeholder)) },
                    leadingIcon = { Text("#") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.communities_create_hashtag_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
                if (error != null) {
                    Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = Spacing.sm))
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(
                    onClick = { onSubmit(name, description, category, hashtag) },
                    enabled = name.trim().length >= 3 && description.trim().length >= 10 && hashtag.isNotBlank(),
                ) {
                    Text(stringResource(R.string.communities_create_submit))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.communities_create_cancel))
            }
        },
    )
}
