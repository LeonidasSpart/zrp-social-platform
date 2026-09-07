package one.zrp.social.mobile.ui.music

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Music Studio's Albums tab content - embedded inside StudioScreen's own
 * tab body, matching how MusicStudio.tsx's <AlbumsTab/> is embedded
 * inside that same parent rather than owning its own header.
 */
@Composable
fun AlbumsTabContent() {
    val viewModel: StudioAlbumsViewModel = viewModel(
        factory = remember { StudioAlbumsViewModelFactory(MusicRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val createCoverPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onCreateCoverPicked(contentResolver, PickedFile(uri, name, mimeType, size))
        }
    }
    val editCoverPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onEditCoverPicked(contentResolver, PickedFile(uri, name, mimeType, size))
        }
    }

    LaunchedEffect(state.message) {
        if (state.message != null) {
            delay(3000)
            viewModel.consumeMessage()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.music_studio_my_albums),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Button(onClick = viewModel::onOpenCreate) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(stringResource(R.string.music_studio_create_album), modifier = Modifier.padding(start = Spacing.xs))
            }
        }

        val messageRes = when (state.message) {
            "created" -> R.string.music_studio_album_created_msg
            "updated" -> R.string.music_studio_album_updated_msg
            "deleted" -> R.string.music_studio_album_deleted_msg
            else -> null
        }
        if (messageRes != null) {
            Text(
                text = stringResource(messageRes),
                color = ZrpRed,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.albums.isEmpty() -> {
                Text(
                    text = stringResource(R.string.music_studio_no_albums_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(Spacing.lg),
                )
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(Spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.albums, key = { it.id }) { album ->
                        AlbumCard(
                            album = album,
                            onManage = { viewModel.onStartManage(album) },
                            onDelete = { viewModel.onStartDelete(album) },
                        )
                    }
                }
            }
        }
    }

    if (state.isCreateModalOpen) {
        CreateAlbumDialog(
            state = state,
            onTitleChange = viewModel::onCreateTitleChange,
            onDescriptionChange = viewModel::onCreateDescriptionChange,
            onReleaseDateChange = viewModel::onCreateReleaseDateChange,
            onPickCover = { createCoverPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            onCreate = viewModel::createAlbum,
            onDismiss = viewModel::onCloseCreate,
        )
    }

    val managingAlbum = state.managingAlbum
    if (managingAlbum != null) {
        ManageAlbumDialog(
            state = state,
            tracks = state.tracks,
            onTitleChange = viewModel::onEditTitleChange,
            onDescriptionChange = viewModel::onEditDescriptionChange,
            onReleaseDateChange = viewModel::onEditReleaseDateChange,
            onPickCover = { editCoverPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            onSaveMetadata = viewModel::saveAlbumMetadata,
            onMoveTrack = viewModel::moveTrack,
            onRemoveTrack = viewModel::removeTrackFromAlbum,
            onAddTrack = viewModel::addTrackToAlbum,
            onDismiss = viewModel::onCancelManage,
        )
    }

    val deletingAlbum = state.deletingAlbum
    if (deletingAlbum != null) {
        AlertDialog(
            onDismissRequest = viewModel::onCancelDelete,
            title = { Text(stringResource(R.string.music_studio_delete_album_title)) },
            text = { Text(stringResource(R.string.music_studio_delete_album_body, deletingAlbum.title)) },
            confirmButton = {
                TextButton(onClick = viewModel::confirmDeleteAlbum, enabled = !state.isDeleting) {
                    Text(
                        stringResource(if (state.isDeleting) R.string.music_studio_deleting else R.string.music_studio_delete_confirm),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::onCancelDelete) { Text(stringResource(R.string.music_studio_cancel)) }
            },
        )
    }
}

@Composable
private fun AlbumCard(album: MusicAlbumSummary, onManage: () -> Unit, onDelete: () -> Unit) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        ) {
            if (album.coverUrl != null) {
                AsyncImage(
                    model = album.coverUrl,
                    contentDescription = album.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    Icons.Filled.Album,
                    contentDescription = album.title,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.xl),
                )
            }
        }
        Column(modifier = Modifier.padding(Spacing.sm)) {
            Text(
                text = album.title,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val trackCountText = pluralStringResource(R.plurals.music_count_tracks, album._count.tracks, album._count.tracks)
            val durationText = if (album.totalDurationSec > 0) " • ${formatTotalDuration(album.totalDurationSec)}" else ""
            Text(
                text = trackCountText + durationText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(modifier = Modifier.padding(top = Spacing.xs)) {
                OutlinedButton(onClick = onManage, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.music_studio_manage), style = MaterialTheme.typography.labelSmall)
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = stringResource(R.string.music_studio_delete_album),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateAlbumDialog(
    state: StudioAlbumsUiState,
    onTitleChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onReleaseDateChange: (String) -> Unit,
    onPickCover: () -> Unit,
    onCreate: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.music_studio_create_album)) },
        text = {
            Column {
                CoverPickerRow(
                    coverUrl = state.createCoverUrl,
                    isUploading = state.isCreateCoverUploading,
                    onPickCover = onPickCover,
                )
                OutlinedTextField(
                    value = state.createTitle,
                    onValueChange = onTitleChange,
                    placeholder = { Text(stringResource(R.string.music_studio_album_title_placeholder)) },
                    isError = state.createTitleRequired,
                    supportingText = if (state.createTitleRequired) {
                        { Text(stringResource(R.string.music_studio_title_required)) }
                    } else {
                        null
                    },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = state.createDescription,
                    onValueChange = onDescriptionChange,
                    placeholder = { Text(stringResource(R.string.music_studio_description_placeholder)) },
                    minLines = 2,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.music_studio_release_date),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = state.createReleaseDate,
                    onValueChange = onReleaseDateChange,
                    placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.createError != null) {
                    Text(
                        text = state.createError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onCreate, enabled = !state.isSavingCreate) {
                Text(
                    stringResource(if (state.isSavingCreate) R.string.music_studio_saving else R.string.music_studio_create_album),
                    color = ZrpRed,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.music_studio_cancel)) }
        },
    )
}

@Composable
private fun ManageAlbumDialog(
    state: StudioAlbumsUiState,
    tracks: List<MusicTrack>,
    onTitleChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onReleaseDateChange: (String) -> Unit,
    onPickCover: () -> Unit,
    onSaveMetadata: () -> Unit,
    onMoveTrack: (index: Int, direction: Int) -> Unit,
    onRemoveTrack: (MusicTrack) -> Unit,
    onAddTrack: (MusicTrack) -> Unit,
    onDismiss: () -> Unit,
) {
    val album = state.managingAlbum ?: return
    val albumTracks = tracks.filter { it.albumId == album.id }.sortedBy { it.trackNumber ?: Int.MAX_VALUE }
    val availableTracks = tracks.filter { it.albumId != album.id }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.music_studio_manage_album)) },
        text = {
            Column {
                CoverPickerRow(
                    coverUrl = state.editCoverUrl,
                    isUploading = state.isEditCoverUploading,
                    onPickCover = onPickCover,
                    changeLabelRes = R.string.music_studio_change_cover,
                )
                OutlinedTextField(
                    value = state.editTitle,
                    onValueChange = onTitleChange,
                    placeholder = { Text(stringResource(R.string.music_studio_album_title_placeholder)) },
                    isError = state.editTitleRequired,
                    supportingText = if (state.editTitleRequired) {
                        { Text(stringResource(R.string.music_studio_title_required)) }
                    } else {
                        null
                    },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = state.editDescription,
                    onValueChange = onDescriptionChange,
                    placeholder = { Text(stringResource(R.string.music_studio_description_placeholder)) },
                    minLines = 2,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = state.editReleaseDate,
                    onValueChange = onReleaseDateChange,
                    placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                if (state.editError != null) {
                    Text(
                        text = state.editError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }
                Button(
                    onClick = onSaveMetadata,
                    enabled = !state.isSavingEdit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                ) {
                    Text(stringResource(if (state.isSavingEdit) R.string.music_studio_saving else R.string.music_studio_save))
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.md))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = stringResource(R.string.music_studio_tracks_in_album),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    if (state.isReordering) {
                        CircularProgressIndicator(modifier = Modifier.padding(start = Spacing.sm).size(14.dp), strokeWidth = 2.dp)
                    }
                }
                if (albumTracks.isEmpty()) {
                    Text(
                        text = stringResource(R.string.music_studio_no_tracks_in_album),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                } else {
                    albumTracks.forEachIndexed { index, track ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xs),
                        ) {
                            Text(
                                text = "${index + 1}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(end = Spacing.xs),
                            )
                            Text(
                                text = track.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(onClick = { onMoveTrack(index, -1) }, enabled = index > 0) {
                                Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.music_studio_move_up), modifier = Modifier.size(16.dp))
                            }
                            IconButton(onClick = { onMoveTrack(index, 1) }, enabled = index < albumTracks.size - 1) {
                                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.music_studio_move_down), modifier = Modifier.size(16.dp))
                            }
                            IconButton(onClick = { onRemoveTrack(track) }) {
                                Icon(
                                    Icons.Filled.Delete,
                                    contentDescription = stringResource(R.string.music_studio_remove_from_album),
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }

                if (availableTracks.isNotEmpty()) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.md))
                    Text(
                        text = stringResource(R.string.music_studio_add_existing_tracks),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    availableTracks.forEach { track ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xs),
                        ) {
                            Text(text = track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            OutlinedButton(onClick = { onAddTrack(track) }) {
                                Text(stringResource(R.string.music_studio_add), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.music_studio_cancel)) }
        },
    )
}

@Composable
private fun CoverPickerRow(
    coverUrl: String?,
    isUploading: Boolean,
    onPickCover: () -> Unit,
    changeLabelRes: Int = R.string.music_studio_add_cover,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        ) {
            if (coverUrl != null) {
                AsyncImage(
                    model = coverUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Filled.Image, contentDescription = null, modifier = Modifier.fillMaxSize().padding(Spacing.sm))
            }
        }
        OutlinedButton(
            onClick = onPickCover,
            enabled = !isUploading,
            modifier = Modifier
                .weight(1f)
                .padding(start = Spacing.sm),
        ) {
            Text(stringResource(if (isUploading) R.string.music_studio_uploading else changeLabelRes))
        }
    }
}

private fun queryFileNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "upload"
    var size = 0L
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}
