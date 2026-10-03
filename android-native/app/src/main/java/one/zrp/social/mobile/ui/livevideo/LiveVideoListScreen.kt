package one.zrp.social.mobile.ui.livevideo

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.clickable
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveVideoRepository
import one.zrp.social.mobile.network.LiveVideoRoomSummary
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EmptyStateAction
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.live.LiveCreateRoomDialog
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

/**
 * ZRP Live Video discovery / "Go Live" - ported from
 * src/app/live-video/page.tsx. Real ranked list from GET
 * /live-video/rooms; creating a room is paid-gated server-side and the
 * server's own rejection surfaces in the dialog.
 */
@Composable
fun LiveVideoListScreen(
    onBack: () -> Unit,
    onOpenRoom: (String) -> Unit,
) {
    val viewModel: LiveVideoListViewModel = viewModel(
        factory = remember { LiveVideoListViewModelFactory(LiveVideoRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(state.createdRoomId) {
        val roomId = state.createdRoomId
        if (roomId != null) {
            showCreate = false
            viewModel.consumeCreatedRoom()
            onOpenRoom(roomId)
        }
    }

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd, state.rooms.size) {
        if (nearEnd && state.rooms.isNotEmpty()) viewModel.loadMore()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.xs, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Icon(Icons.Filled.Videocam, contentDescription = null, tint = ZrpRed, modifier = Modifier.padding(start = Spacing.xs))
            Text(
                text = stringResource(R.string.live_video_page_title),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(start = Spacing.sm),
            )
            Button(
                onClick = { showCreate = true },
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = Color.White),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(IconSize.sm))
                Text(text = stringResource(R.string.live_audio_go_live), modifier = Modifier.padding(start = Spacing.xs))
            }
        }
        Text(
            text = stringResource(R.string.live_video_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs),
        )

        when {
            state.isLoading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null && state.rooms.isEmpty() -> ZrpEmptyState(
                icon = Icons.Filled.Videocam,
                title = stringResource(R.string.live_audio_error_loading_rooms),
                body = localizedError(state.error),
                primaryAction = EmptyStateAction(label = stringResource(R.string.action_retry), onClick = viewModel::refresh),
            )
            state.rooms.isEmpty() -> ZrpEmptyState(
                icon = Icons.Filled.Videocam,
                title = stringResource(R.string.live_audio_no_rooms_title),
                body = stringResource(R.string.live_video_no_rooms_desc),
                primaryAction = EmptyStateAction(
                    label = stringResource(R.string.live_audio_go_live),
                    icon = Icons.Filled.Add,
                    onClick = { showCreate = true },
                ),
            )
            else -> LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                items(state.rooms, key = { it.id }) { room ->
                    LiveVideoRoomCard(room = room, onClick = { onOpenRoom(room.id) })
                }
                if (state.isLoadingMore) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(Spacing.md), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(IconSize.md))
                        }
                    }
                }
            }
        }
    }

    if (showCreate) {
        LaunchedEffect(Unit) { viewModel.loadMyCommunities() }
        LiveCreateRoomDialog(
            isSubmitting = state.isCreating,
            error = state.createError,
            myCommunities = state.myCommunities,
            onDismiss = {
                showCreate = false
                viewModel.dismissCreateError()
            },
            onSubmit = { title, description, category, visibility, communityId, scheduledAtMillis ->
                viewModel.createRoom(title, description, category, visibility, communityId, scheduledAtMillis)
            },
        )
    }
}

@Composable
private fun LiveVideoRoomCard(room: LiveVideoRoomSummary, onClick: () -> Unit) {
    val hostName = room.host.name ?: room.host.username
    Card(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = room.title, onClick = onClick),
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Avatar(url = room.host.avatarUrl, name = hostName, size = 48.dp, ringColor = ZrpRed, ringWidth = 2.dp)
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
                            modifier = Modifier.weight(1f, fill = false).padding(start = Spacing.sm),
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
                    text = stringResource(R.string.live_audio_hosted_by, hostName),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = Spacing.sm)) {
                Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = stringResource(R.string.live_video_viewer_count, room.viewerCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}
