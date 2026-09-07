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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private enum class StudioTab { TRACKS, ARTIST }

/**
 * The Music Studio - the same real GET /music/access gate MusicStudio.tsx's
 * own !access?.allowed branch uses, then a real 2-tab bar (Tracks,
 * Artist Profile) once allowed. Albums management (that same
 * component's third tab) is its own later phase, so it isn't shown
 * here yet - only tabs with a real, working destination are ever
 * rendered.
 */
@Composable
fun StudioScreen(onBack: () -> Unit) {
    val viewModel: StudioViewModel = viewModel(
        factory = remember { StudioViewModelFactory(MusicRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver
    var tab by remember { mutableStateOf(StudioTab.TRACKS) }

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onAvatarPicked(contentResolver, uri, name, mimeType, size)
        }
    }
    val bannerPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onBannerPicked(contentResolver, uri, name, mimeType, size)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(
                    text = stringResource(R.string.music_shell_studio_eyebrow),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                )
                Text(
                    text = stringResource(R.string.music_shell_studio_label),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
        Text(
            text = stringResource(R.string.music_shell_studio_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = Spacing.lg, bottom = Spacing.sm),
        )
        HorizontalDivider()

        when {
            state.isLoadingAccess -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.access?.allowed != true -> {
                GateContent(
                    state = state,
                    onApplyNameChange = viewModel::onApplyNameChange,
                    onApply = viewModel::applyForArtist,
                )
            }
            state.isLoadingProfile -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            else -> {
                Column(modifier = Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    ) {
                        FilterChip(
                            selected = tab == StudioTab.TRACKS,
                            onClick = { tab = StudioTab.TRACKS },
                            label = { Text(stringResource(R.string.music_studio_tab_tracks)) },
                        )
                        FilterChip(
                            selected = tab == StudioTab.ARTIST,
                            onClick = { tab = StudioTab.ARTIST },
                            label = { Text(stringResource(R.string.music_studio_tab_artist)) },
                        )
                    }
                    HorizontalDivider()

                    when (tab) {
                        StudioTab.TRACKS -> TracksTabContent()
                        StudioTab.ARTIST -> {
                            ArtistProfileForm(
                                state = state,
                                onDisplayNameChange = viewModel::onDisplayNameChange,
                                onBioChange = viewModel::onBioChange,
                                onChangeAvatar = { avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                onChangeBanner = { bannerPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                onSave = viewModel::save,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GateContent(
    state: StudioUiState,
    onApplyNameChange: (String) -> Unit,
    onApply: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text = stringResource(R.string.music_shell_gate_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        Text(
            text = stringResource(R.string.music_shell_gate_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.xs),
        )

        if (state.access?.hasArtistProfile == true) {
            Text(
                text = stringResource(R.string.music_shell_pending_verification),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .padding(top = Spacing.lg)
                    .fillMaxWidth()
                    .background(Color(0x1AF59E0B), RoundedCornerShape(12.dp))
                    .padding(Spacing.md),
            )
        } else {
            Text(
                text = stringResource(R.string.music_shell_apply_intro_prefix) + " " +
                    stringResource(R.string.music_shell_apply_intro_link) + " " +
                    stringResource(R.string.music_shell_apply_intro_suffix),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            OutlinedTextField(
                value = state.applyName,
                onValueChange = onApplyNameChange,
                placeholder = { Text(stringResource(R.string.music_shell_artist_name_placeholder)) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
            )
            Button(
                onClick = onApply,
                enabled = state.applyName.isNotBlank() && !state.isApplying,
                modifier = Modifier.padding(top = Spacing.sm),
            ) {
                Text(
                    stringResource(
                        if (state.isApplying) R.string.music_shell_apply_submitting else R.string.music_shell_apply_submit,
                    ),
                )
            }
        }

        if (state.error != null) {
            Text(
                text = state.error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

@Composable
private fun ArtistProfileForm(
    state: StudioUiState,
    onDisplayNameChange: (String) -> Unit,
    onBioChange: (String) -> Unit,
    onChangeAvatar: () -> Unit,
    onChangeBanner: () -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .clickable(onClick = onChangeBanner),
            ) {
                if (state.bannerUrl != null) {
                    AsyncImage(
                        model = state.bannerUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(
                            if (state.isBannerUploading) R.string.music_studio_uploading else R.string.music_studio_change_banner,
                        ),
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = Spacing.md)
                    .offset(y = 28.dp)
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .clickable(onClick = onChangeAvatar),
                contentAlignment = Alignment.Center,
            ) {
                if (state.avatarUrl != null) {
                    AsyncImage(
                        model = state.avatarUrl,
                        contentDescription = stringResource(R.string.music_studio_change_avatar),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        Icons.Filled.Person,
                        contentDescription = stringResource(R.string.music_studio_change_avatar),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (state.isAvatarUploading) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.4f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = Color.White)
                    }
                }
            }
        }

        Box(modifier = Modifier.height(36.dp))

        OutlinedTextField(
            value = state.displayName,
            onValueChange = onDisplayNameChange,
            placeholder = { Text(stringResource(R.string.music_shell_artist_name_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.bio,
            onValueChange = onBioChange,
            placeholder = { Text(stringResource(R.string.music_studio_bio_placeholder)) },
            minLines = 3,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm),
        )

        if (state.error != null) {
            Text(
                text = state.error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
        if (state.saved) {
            Text(
                text = stringResource(R.string.music_studio_artist_profile_saved),
                color = ZrpRed,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }

        Button(
            onClick = onSave,
            enabled = !state.isSaving && !state.isAvatarUploading && !state.isBannerUploading,
            modifier = Modifier.padding(top = Spacing.md),
        ) {
            Text(stringResource(if (state.isSaving) R.string.music_studio_saving else R.string.music_studio_save))
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
