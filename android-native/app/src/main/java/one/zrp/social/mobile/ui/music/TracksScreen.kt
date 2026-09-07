package one.zrp.social.mobile.ui.music

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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

// A suggestion list, not a closed vocabulary - matches src/lib/music/
// genres.ts exactly (also deliberately untranslated there: genre is a
// plain free-text field used for real discovery/grouping, so a
// translated label here would put the same real genre in a different
// bucket per language). An artist can still type any genre they want;
// tapping a chip is just a shortcut.
private val MUSIC_GENRES = listOf(
    "Pop", "Hip-Hop", "R&B", "Rock", "Alternative", "Indie", "Electronic",
    "House", "Techno", "Dance", "Ambient", "Jazz", "Blues", "Soul", "Funk",
    "Classical", "Country", "Folk", "Metal", "Punk", "Reggae", "Reggaeton",
    "Latin", "Afrobeats", "K-Pop", "Gospel", "World",
)

/**
 * Music Studio's Tracks tab content - embedded inside StudioScreen's
 * own tab body, matching how MusicStudio.tsx's <TracksTab/> is embedded
 * inside that same parent rather than owning its own header.
 */
@Composable
fun TracksTabContent() {
    val viewModel: TracksViewModel = viewModel(
        factory = remember { TracksViewModelFactory(MusicRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val audioPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "audio/*"
            viewModel.onAudioPicked(contentResolver, PickedFile(uri, name, mimeType, size))
        }
    }
    val coverPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onCoverPicked(PickedFile(uri, name, mimeType, size))
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

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg),
    ) {
        val messageRes = when (state.message) {
            "updated" -> R.string.music_studio_track_updated_msg
            "deleted" -> R.string.music_studio_track_deleted_msg
            else -> null
        }
        if (messageRes != null) {
            item {
                Text(
                    text = stringResource(messageRes),
                    color = ZrpRed,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                )
            }
        }
        item {
            UploadCard(
                state = state,
                onArtistNameChange = viewModel::onArtistNameChange,
                onTitleChange = viewModel::onTitleChange,
                onGenreChange = viewModel::onGenreChange,
                onExplicitChange = viewModel::onExplicitChange,
                onPickAudio = { audioPickerLauncher.launch("audio/*") },
                onPickCover = { coverPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onPublish = { viewModel.publish(contentResolver) },
                onDiscard = viewModel::discardUpload,
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        item {
            Text(
                text = stringResource(R.string.music_studio_my_tracks),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = Spacing.sm),
            )
        }
        when {
            state.isLoading -> {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
            state.tracks.isEmpty() -> {
                item {
                    Text(
                        text = stringResource(R.string.music_studio_no_tracks_yet),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            else -> {
                items(state.tracks, key = { it.id }) { track ->
                    TrackListRow(
                        track = track,
                        onEdit = { viewModel.onStartEdit(track) },
                        onDelete = { viewModel.onStartDelete(track) },
                    )
                }
            }
        }
    }

    val editingTrack = state.editingTrack
    if (editingTrack != null) {
        EditTrackModal(
            state = state,
            albums = state.albums,
            onTitleChange = viewModel::onEditTitleChange,
            onDescriptionChange = viewModel::onEditDescriptionChange,
            onGenreChange = viewModel::onEditGenreChange,
            onExplicitChange = viewModel::onEditExplicitChange,
            onAlbumChange = viewModel::onEditAlbumChange,
            onChangeCover = { editCoverPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            onSave = viewModel::saveEdit,
            onDismiss = viewModel::onCancelEdit,
        )
    }

    val deletingTrack = state.deletingTrack
    if (deletingTrack != null) {
        AlertDialog(
            onDismissRequest = viewModel::onCancelDelete,
            title = { Text(stringResource(R.string.music_studio_delete_track_title)) },
            text = { Text(stringResource(R.string.music_studio_delete_track_body, deletingTrack.title)) },
            confirmButton = {
                TextButton(onClick = viewModel::confirmDelete, enabled = !state.isDeleting) {
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
private fun UploadCard(
    state: TracksUiState,
    onArtistNameChange: (String) -> Unit,
    onTitleChange: (String) -> Unit,
    onGenreChange: (String) -> Unit,
    onExplicitChange: (Boolean) -> Unit,
    onPickAudio: () -> Unit,
    onPickCover: () -> Unit,
    onPublish: () -> Unit,
    onDiscard: () -> Unit,
) {
    val hasPendingUpload = state.pendingAudioUrl != null
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.lg),
    ) {
        Text(
            text = stringResource(R.string.music_shell_upload_music),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )

        if (state.hasArtistProfile == false) {
            OutlinedTextField(
                value = state.artistNameOverride,
                onValueChange = onArtistNameChange,
                placeholder = { Text(stringResource(R.string.music_shell_artist_name_placeholder)) },
                enabled = !hasPendingUpload,
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
            )
        }

        OutlinedTextField(
            value = state.title,
            onValueChange = onTitleChange,
            placeholder = { Text(stringResource(R.string.music_shell_song_title_placeholder)) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm),
        )

        OutlinedTextField(
            value = state.genre,
            onValueChange = onGenreChange,
            placeholder = { Text(stringResource(R.string.music_shell_genre_placeholder)) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            modifier = Modifier.padding(top = Spacing.xs),
        ) {
            items(MUSIC_GENRES, key = { it }) { genre ->
                AssistChip(onClick = { onGenreChange(genre) }, label = { Text(genre) })
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = Spacing.sm),
        ) {
            Checkbox(checked = state.explicit, onCheckedChange = onExplicitChange)
            Text(stringResource(R.string.music_studio_explicit_label))
        }

        if (!hasPendingUpload) {
            OutlinedButton(onClick = onPickAudio, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                Text(state.audioPick?.fileName ?: stringResource(R.string.music_shell_audio_file_label))
            }
            OutlinedButton(onClick = onPickCover, modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                Text(state.coverPick?.fileName ?: stringResource(R.string.music_shell_cover_artwork_label))
            }
        }

        val canSubmit = hasPendingUpload || (state.audioPick != null && state.title.isNotBlank())
        Button(
            onClick = onPublish,
            enabled = !state.isPublishing && canSubmit,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        ) {
            Text(
                stringResource(
                    when {
                        state.isPublishing -> R.string.music_shell_publishing
                        hasPendingUpload -> R.string.music_studio_retry_publish
                        else -> R.string.music_shell_publish_track
                    },
                ),
            )
        }

        if (hasPendingUpload && !state.isPublishing) {
            TextButton(onClick = onDiscard, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.music_studio_discard_upload))
            }
        }

        if (state.publishError != null) {
            Text(
                text = state.publishError,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }

        Text(
            text = stringResource(R.string.music_shell_upload_hint),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = Spacing.sm),
        )
    }
}

@Composable
private fun TrackListRow(track: MusicTrack, onEdit: () -> Unit, onDelete: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(6.dp)),
        ) {
            if (track.coverUrl != null) {
                AsyncImage(
                    model = track.coverUrl,
                    contentDescription = track.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Filled.MusicNote, contentDescription = track.title, modifier = Modifier.fillMaxSize())
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = Spacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (track.explicit) {
                    Text(
                        text = stringResource(R.string.music_studio_explicit_badge),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .padding(start = Spacing.xs)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp),
                    )
                }
            }
            val subtitle = (track.album?.title ?: stringResource(R.string.music_studio_no_album)) +
                (track.genre?.let { " • $it" } ?: "")
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onEdit) {
            Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.music_studio_edit_track), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.music_studio_delete_track), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    HorizontalDivider()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditTrackModal(
    state: TracksUiState,
    albums: List<MusicAlbumSummary>,
    onTitleChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onGenreChange: (String) -> Unit,
    onExplicitChange: (Boolean) -> Unit,
    onAlbumChange: (String?) -> Unit,
    onChangeCover: () -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.music_studio_edit_track)) },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(10.dp)),
                    ) {
                        if (state.editCoverUrl != null) {
                            AsyncImage(
                                model = state.editCoverUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Icon(Icons.Filled.Image, contentDescription = null, modifier = Modifier.fillMaxSize())
                        }
                    }
                    OutlinedButton(
                        onClick = onChangeCover,
                        enabled = !state.isEditCoverUploading,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = Spacing.sm),
                    ) {
                        Text(
                            stringResource(
                                if (state.isEditCoverUploading) R.string.music_studio_uploading else R.string.music_studio_change_cover,
                            ),
                        )
                    }
                }

                OutlinedTextField(
                    value = state.editTitle,
                    onValueChange = onTitleChange,
                    placeholder = { Text(stringResource(R.string.music_shell_song_title_placeholder)) },
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
                    value = state.editGenre,
                    onValueChange = onGenreChange,
                    placeholder = { Text(stringResource(R.string.music_shell_genre_placeholder)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )

                var albumMenuExpanded by remember { mutableStateOf(false) }
                val selectedAlbumTitle = albums.firstOrNull { it.id == state.editAlbumId }?.title
                    ?: stringResource(R.string.music_studio_no_album)
                ExposedDropdownMenuBox(
                    expanded = albumMenuExpanded,
                    onExpandedChange = { albumMenuExpanded = it },
                    modifier = Modifier.padding(top = Spacing.sm),
                ) {
                    OutlinedTextField(
                        value = selectedAlbumTitle,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = albumMenuExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                    )
                    ExposedDropdownMenu(
                        expanded = albumMenuExpanded,
                        onDismissRequest = { albumMenuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.music_studio_no_album)) },
                            onClick = { onAlbumChange(null); albumMenuExpanded = false },
                        )
                        albums.forEach { album ->
                            DropdownMenuItem(
                                text = { Text(album.title) },
                                onClick = { onAlbumChange(album.id); albumMenuExpanded = false },
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = Spacing.sm),
                ) {
                    Checkbox(checked = state.editExplicit, onCheckedChange = onExplicitChange)
                    Text(stringResource(R.string.music_studio_explicit_label))
                }

                if (state.editError != null) {
                    Text(
                        text = state.editError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onSave, enabled = !state.isSavingEdit) {
                Text(
                    stringResource(if (state.isSavingEdit) R.string.music_studio_saving else R.string.music_studio_save),
                    color = ZrpRed,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.music_studio_cancel)) }
        },
    )
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
