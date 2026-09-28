package one.zrp.social.mobile.ui.liveaudio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveAudioRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.LiveAudioRoomSummary
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

/**
 * ZRP Live Audio's discovery/"Go Live" screen - ported from
 * src/app/live-audio/page.tsx + CreateLiveAudioModal.tsx. The list works
 * logged-out for PUBLIC rooms; creating a room is paid-gated server-side
 * (requireLiveAudioAccess), never re-implemented client-side - a free
 * user who taps "Go Live" simply sees the server's own rejection message
 * surface as [LiveAudioListUiState.createError], the same way every other
 * plan-gated action in this app degrades.
 */
@Composable
fun LiveAudioListScreen(
    onBack: () -> Unit,
    onOpenRoom: (String) -> Unit,
) {
    val viewModel: LiveAudioListViewModel = viewModel(
        factory = remember { LiveAudioListViewModelFactory(LiveAudioRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }

    LaunchedEffect(state.createdRoomId) {
        val roomId = state.createdRoomId
        if (roomId != null) {
            showCreate = false
            viewModel.consumeCreatedRoom()
            onOpenRoom(roomId)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.xs, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.shorts_back))
            }
            Icon(Icons.Filled.Podcasts, contentDescription = null, tint = ZrpRed, modifier = Modifier.padding(start = Spacing.xs))
            Text(
                text = stringResource(R.string.live_audio_page_title),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).padding(start = Spacing.sm),
            )
            Button(onClick = { showCreate = true }) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(text = stringResource(R.string.live_audio_go_live), modifier = Modifier.padding(start = Spacing.xs))
            }
        }
        Text(
            text = stringResource(R.string.live_audio_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs),
        )

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.error != null && state.rooms.isEmpty() -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(text = localizedError(state.error) ?: "", textAlign = TextAlign.Center)
                    TextButton(onClick = viewModel::refresh, modifier = Modifier.padding(top = Spacing.sm)) {
                        Text(stringResource(R.string.action_retry))
                    }
                }
            }
            state.rooms.isEmpty() -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Filled.Podcasts, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        text = stringResource(R.string.live_audio_no_rooms_title),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.md),
                    )
                    Text(
                        text = stringResource(R.string.live_audio_no_rooms_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    items(state.rooms, key = { it.id }) { room ->
                        LiveAudioRoomCard(room = room, onClick = { onOpenRoom(room.id) })
                    }
                }
            }
        }
    }

    if (showCreate) {
        LaunchedEffect(Unit) { viewModel.loadMyCommunities() }
        CreateLiveAudioRoomDialog(
            isSubmitting = state.isCreating,
            error = state.createError,
            myCommunities = state.myCommunities,
            onDismiss = {
                showCreate = false
                viewModel.dismissCreateError()
            },
            onSubmit = { title, description, category, visibility, communityId ->
                viewModel.createRoom(title, description, category, visibility, communityId, scheduledAtMillis = null)
            },
        )
    }
}

@Composable
private fun LiveAudioRoomCard(room: LiveAudioRoomSummary, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(url = room.host.avatarUrl, name = room.host.name ?: room.host.username, size = 44.dp)
            Column(modifier = Modifier.weight(1f).padding(start = Spacing.md)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(6.dp).background(ZrpRed, CircleShape))
                    Text(
                        text = stringResource(R.string.live_audio_live_now),
                        color = ZrpRed,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(start = Spacing.xs),
                    )
                    if (room.community != null) {
                        Text(
                            text = room.community.name,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = Spacing.sm),
                        )
                    }
                }
                Text(
                    text = room.title,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    text = stringResource(R.string.live_audio_hosted_by, room.host.name ?: room.host.username),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Groups, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = stringResource(R.string.live_audio_listener_count, room.listenerCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun CreateLiveAudioRoomDialog(
    isSubmitting: Boolean,
    error: String?,
    myCommunities: List<CommunitySummary>,
    onDismiss: () -> Unit,
    onSubmit: (title: String, description: String?, category: String?, visibility: String, communityId: String?) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("PUBLIC") }
    var communityId by remember { mutableStateOf<String?>(null) }
    var communityMenuExpanded by remember { mutableStateOf(false) }

    val visibilityOptions = listOf(
        "PUBLIC" to stringResource(R.string.live_audio_visibility_public),
        "COMMUNITY" to stringResource(R.string.live_audio_visibility_community),
        "PRIVATE" to stringResource(R.string.live_audio_visibility_private),
    )
    val canSubmit = title.trim().isNotEmpty() && title.trim().length <= 200 && !isSubmitting &&
        (visibility != "COMMUNITY" || communityId != null)

    androidx.compose.material3.AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.live_audio_create_title)) },
        text = {
            Column {
                if (error != null) {
                    Text(
                        text = localizedError(error) ?: "",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = Spacing.sm),
                    )
                }
                OutlinedTextField(
                    value = title,
                    onValueChange = { if (it.length <= 200) title = it },
                    label = { Text(stringResource(R.string.live_audio_title_label)) },
                    placeholder = { Text(stringResource(R.string.live_audio_title_placeholder)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { if (it.length <= 2000) description = it },
                    label = { Text(stringResource(R.string.live_audio_description_label)) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { if (it.length <= 60) category = it },
                    label = { Text(stringResource(R.string.live_audio_category_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.live_audio_visibility_label),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    visibilityOptions.forEach { (value, label) ->
                        val selected = visibility == value
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .border(
                                    width = 1.dp,
                                    color = if (selected) ZrpRed else MaterialTheme.colorScheme.outline,
                                    shape = RoundedCornerShape(12.dp),
                                )
                                .background(if (selected) ZrpRed else MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
                                .clickable { visibility = value }
                                .padding(vertical = Spacing.sm),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
                if (visibility == "COMMUNITY") {
                    if (myCommunities.isEmpty()) {
                        Text(
                            text = stringResource(R.string.live_audio_no_communities_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    } else {
                        ExposedDropdownMenuBox(
                            expanded = communityMenuExpanded,
                            onExpandedChange = { communityMenuExpanded = it },
                            modifier = Modifier.padding(top = Spacing.sm),
                        ) {
                            OutlinedTextField(
                                value = myCommunities.firstOrNull { it.id == communityId }?.name
                                    ?: stringResource(R.string.live_audio_select_community_placeholder),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(stringResource(R.string.live_audio_community_label)) },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = communityMenuExpanded) },
                                modifier = Modifier.menuAnchor().fillMaxWidth(),
                            )
                            DropdownMenu(expanded = communityMenuExpanded, onDismissRequest = { communityMenuExpanded = false }) {
                                myCommunities.forEach { community ->
                                    DropdownMenuItem(
                                        text = { Text(community.name) },
                                        onClick = {
                                            communityId = community.id
                                            communityMenuExpanded = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(
                    onClick = {
                        onSubmit(
                            title,
                            description.trim().ifEmpty { null },
                            category.trim().ifEmpty { null },
                            visibility,
                            if (visibility == "COMMUNITY") communityId else null,
                        )
                    },
                    enabled = canSubmit,
                ) {
                    Text(stringResource(R.string.live_audio_create_submit))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
