package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.ui.components.VerifiedBadge

/**
 * The native equivalent of ChatContactDrawer.tsx - real partner data
 * (derived from the conversation's own already-loaded messages, no
 * separate profile fetch needed), Profile/Call/Video/More actions, and
 * a shared-media grid using the exact same real-photos-only filter
 * (excludes voice-message and document attachments, which reuse
 * imageUrl too) the website itself applies.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatContactPopup(
    partner: PostAuthor,
    messages: List<ChatMessage>,
    isBlocked: Boolean,
    onDismiss: () -> Unit,
    onOpenProfile: () -> Unit,
    onVoiceCall: () -> Unit,
    onVideoCall: () -> Unit,
    onBlockToggled: (Boolean) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val coroutineScope = rememberCoroutineScope()
    var showMore by remember { mutableStateOf(false) }
    var blocking by remember { mutableStateOf(false) }

    val sharedMedia = remember(messages) {
        messages.filter {
            it.imageUrl != null && !it.content.startsWith("🎤") && !it.content.startsWith("📎")
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (partner.avatarUrl != null) {
                AsyncImage(
                    model = partner.avatarUrl,
                    contentDescription = partner.name ?: partner.username,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.errorContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = (partner.name ?: partner.username).take(1).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 12.dp),
            ) {
                Text(
                    text = partner.name ?: partner.username,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = partner.badgeType)
            }
            Text(
                text = "@${partner.username}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp, start = 24.dp, end = 24.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                ContactAction(
                    icon = Icons.Filled.Person,
                    label = stringResource(R.string.chat_contact_profile),
                    onClick = { onDismiss(); onOpenProfile() },
                )
                ContactAction(
                    icon = Icons.Filled.Call,
                    label = stringResource(R.string.chat_contact_call),
                    onClick = { onDismiss(); onVoiceCall() },
                )
                ContactAction(
                    icon = Icons.Filled.Videocam,
                    label = stringResource(R.string.chat_contact_video),
                    onClick = { onDismiss(); onVideoCall() },
                )
                Box {
                    ContactAction(
                        icon = Icons.Filled.MoreHoriz,
                        label = stringResource(R.string.chat_contact_more),
                        onClick = { showMore = true },
                    )
                    DropdownMenu(expanded = showMore, onDismissRequest = { showMore = false }) {
                        DropdownMenuItem(
                            leadingIcon = {
                                if (blocking) {
                                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Filled.Block, contentDescription = null)
                                }
                            },
                            text = {
                                Text(
                                    "${stringResource(if (isBlocked) R.string.chat_unblock else R.string.chat_block)} @${partner.username}",
                                    color = MaterialTheme.colorScheme.error,
                                )
                            },
                            enabled = !blocking,
                            onClick = {
                                showMore = false
                                blocking = true
                                coroutineScope.launch {
                                    runCatching { ApiClient.usersApi.toggleBlock(partner.username) }
                                        .onSuccess { onBlockToggled(it.blocked) }
                                    blocking = false
                                }
                            },
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Photo, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(
                        text = stringResource(R.string.chat_shared_media),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                if (sharedMedia.isNotEmpty()) {
                    Text(
                        text = sharedMedia.size.toString(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (sharedMedia.isEmpty()) {
                Text(
                    text = stringResource(R.string.chat_no_shared_media),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(24.dp),
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    items(sharedMedia.take(8), key = { it.id }) { message ->
                        AsyncImage(
                            model = message.imageUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .padding(2.dp)
                                .aspectRatio(1f)
                                .clip(MaterialTheme.shapes.small),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ContactAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null)
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
