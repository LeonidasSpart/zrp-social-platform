package one.zrp.social.mobile.ui.stories

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The story composer - a real POST /stories call with the same
 * text-and/or-one-image-or-video shape StoryComposer.tsx sends, media
 * picked via Android's Photo Picker and uploaded through the real
 * storyMedia UploadThing router (see CreateStoryViewModel's KDoc).
 * Stories expire after 24 hours server-side, matching the expiry note
 * shown below the submit button on web.
 */
@OptIn(UnstableApi::class)
@Composable
fun CreateStoryScreen(onPosted: () -> Unit) {
    val viewModel: CreateStoryViewModel = viewModel(
        factory = remember { CreateStoryViewModelFactory(StoriesRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val mediaPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryStoryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
            viewModel.onMediaPicked(contentResolver, uri, name, mimeType, size)
        }
    }

    LaunchedEffect(state.posted) {
        if (state.posted) {
            viewModel.consumePostedEvent()
            onPosted()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text(
            text = stringResource(R.string.stories_add_story),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 16.dp),
        )

        OutlinedTextField(
            value = state.content,
            onValueChange = { viewModel.onContentChange(it) },
            placeholder = { Text(stringResource(R.string.stories_whats_on_your_mind)) },
            enabled = !state.isPosting,
            modifier = Modifier.fillMaxWidth(),
            maxLines = 3,
        )

        if (state.isUploading) {
            LinearProgressIndicator(
                progress = { state.uploadProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
                color = ZrpRed,
            )
        }

        val mediaUrl = state.mediaUrl
        if (mediaUrl != null) {
            StoryMediaPreview(
                url = mediaUrl,
                isVideo = state.mediaType == "video",
                onRemove = { viewModel.onRemoveMedia() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
            )
        }

        val mediaError = state.mediaError
        if (mediaError != null) {
            Text(
                text = storyMediaErrorMessage(mediaError),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm),
        ) {
            val canAddMedia = !state.isPosting && !state.isUploading && mediaUrl == null
            OutlinedButton(
                onClick = {
                    mediaPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                enabled = canAddMedia,
            ) {
                Icon(Icons.Filled.Image, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(stringResource(R.string.stories_image))
            }
            Spacer(modifier = Modifier.size(Spacing.sm))
            OutlinedButton(
                onClick = {
                    mediaPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly),
                    )
                },
                enabled = canAddMedia,
            ) {
                Icon(Icons.Filled.Videocam, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(stringResource(R.string.stories_video))
            }
        }

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Button(
            onClick = { viewModel.submit() },
            enabled = (state.content.isNotBlank() || state.mediaUrl != null) && !state.isPosting && !state.isUploading,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
        ) {
            if (state.isPosting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else if (state.isUploading) {
                Text(stringResource(R.string.stories_uploading))
            } else {
                Text(stringResource(R.string.stories_share_story))
            }
        }
    }
}

@Composable
private fun storyMediaErrorMessage(error: StoryMediaError): String = when (error) {
    StoryMediaError.UnsupportedType -> stringResource(R.string.stories_err_unsupported_type)
    is StoryMediaError.FileTooLarge -> stringResource(R.string.stories_err_file_too_large)
    is StoryMediaError.UploadFailed -> error.detail
}

@OptIn(UnstableApi::class)
@Composable
private fun StoryMediaPreview(
    url: String,
    isVideo: Boolean,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .height(240.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(Color.Black),
    ) {
        if (isVideo) {
            val context = LocalContext.current
            val exoPlayer = remember(url) {
                ExoPlayer.Builder(context).build().apply {
                    setMediaItem(MediaItem.fromUri(url))
                    prepare()
                }
            }
            DisposableEffect(exoPlayer) {
                onDispose { exoPlayer.release() }
            }
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { PlayerView(context).apply { player = exoPlayer; useController = true } },
            )
        } else {
            AsyncImage(
                model = url,
                contentDescription = "Story media preview",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
        IconButton(
            onClick = onRemove,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(Spacing.xs),
        ) {
            Icon(Icons.Filled.Close, contentDescription = "Remove media", tint = Color.White)
        }
    }
}

private fun queryStoryFileNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
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
