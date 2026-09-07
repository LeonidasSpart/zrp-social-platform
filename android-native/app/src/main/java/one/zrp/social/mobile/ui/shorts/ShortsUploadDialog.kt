package one.zrp.social.mobile.ui.shorts

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.getPlanLimits

/**
 * ZRP Shorts' "Post a Short" - ported from ShortUploadModal.tsx: a
 * centered modal card over the feed (not a full-screen route, matching
 * the website's own overlay presentation), a 9:16 video picker/preview,
 * a caption field capped at the real per-plan post length, and the
 * same real error surface ShortsUploadViewModel resolves.
 */
@OptIn(UnstableApi::class)
@Composable
fun ShortsUploadDialog(onDismiss: () -> Unit, onPosted: (Post) -> Unit) {
    val viewModel: ShortsUploadViewModel = viewModel(
        factory = remember { ShortsUploadViewModelFactory(PostsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver
    val limits = getPlanLimits(state.plan)

    val pickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryShortFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
            viewModel.onFilePicked(name, mimeType, size, uri)
        }
    }

    LaunchedEffect(state.posted) {
        state.posted?.let { post ->
            viewModel.consumePosted()
            onPosted(post)
        }
    }

    Dialog(
        onDismissRequest = { if (!state.uploading) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .padding(24.dp)
                .widthIn(max = 420.dp),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = stringResource(R.string.shorts_post_a_short), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { if (!state.uploading) onDismiss() }, enabled = !state.uploading) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.shorts_upload_close))
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                ) {
                    val uri = state.fileUri
                    if (uri != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 320.dp)
                                .aspectRatio(9f / 16f)
                                .clip(MaterialTheme.shapes.medium)
                                .background(Color.Black),
                        ) {
                            ShortsUploadPreviewPlayer(uri = uri, modifier = Modifier.fillMaxSize())
                            IconButton(
                                onClick = viewModel::onClearFile,
                                enabled = !state.uploading,
                                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                            ) {
                                Icon(
                                    Icons.Filled.Close,
                                    contentDescription = stringResource(R.string.shorts_upload_remove_video),
                                    tint = Color.White,
                                )
                            }
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 320.dp)
                                .aspectRatio(9f / 16f)
                                .clip(MaterialTheme.shapes.medium)
                                .border(2.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
                                .clickable(enabled = !state.uploading) {
                                    pickerLauncher.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly),
                                    )
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    Icons.Filled.CloudUpload,
                                    contentDescription = null,
                                    modifier = Modifier.size(32.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = stringResource(R.string.shorts_upload_choose_video),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = stringResource(R.string.shorts_upload_formats_hint),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(top = 4.dp, start = 16.dp, end = 16.dp),
                                )
                                Text(
                                    text = stringResource(R.string.shorts_upload_up_to_mb, limits.videoUploadMB),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    OutlinedTextField(
                        value = state.caption,
                        onValueChange = { if (it.length <= limits.postLength) viewModel.onCaptionChange(it) },
                        placeholder = { Text(stringResource(R.string.shorts_upload_caption_placeholder)) },
                        enabled = !state.uploading,
                        minLines = 2,
                        maxLines = 2,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    )

                    val error = state.error
                    if (error != null) {
                        Text(
                            text = shortUploadErrorMessage(error),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp)
                                .clickable { viewModel.dismissError() },
                        )
                    }

                    Button(
                        onClick = { viewModel.submit(contentResolver) },
                        enabled = state.fileUri != null && !state.uploading,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp, bottom = 16.dp),
                    ) {
                        if (state.uploading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.shorts_upload_posting))
                        } else {
                            Text(stringResource(R.string.shorts_upload_post_short))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun shortUploadErrorMessage(error: ShortUploadError): String = when (error) {
    ShortUploadError.GifNotAllowed -> stringResource(R.string.shorts_upload_err_gif_not_allowed)
    ShortUploadError.NotVideo -> stringResource(R.string.shorts_upload_err_not_video)
    is ShortUploadError.TooLarge -> stringResource(R.string.shorts_upload_err_too_large, error.maxMb)
    ShortUploadError.ChooseVideoFirst -> stringResource(R.string.shorts_upload_err_choose_video_first)
    ShortUploadError.GifSimple -> stringResource(R.string.shorts_upload_err_gif_simple)
    ShortUploadError.OnlyRealVideo -> stringResource(R.string.shorts_upload_err_only_real_video)
    ShortUploadError.UploadedGif -> stringResource(R.string.shorts_upload_err_uploaded_gif)
    ShortUploadError.PublishedGif -> stringResource(R.string.shorts_upload_err_published_gif)
    ShortUploadError.UrlGenFailed -> stringResource(R.string.shorts_upload_err_url_gen_failed)
    is ShortUploadError.UploadFailed ->
        stringResource(R.string.shorts_upload_err_generic) + ": " + error.detail
    is ShortUploadError.PublishFailed ->
        error.detail ?: stringResource(R.string.shorts_upload_err_failed_publish)
}

/**
 * A real, playable preview with ExoPlayer's own transport controls
 * visible, matching web's `<video controls playsInline>` preview of
 * the just-picked file before it's uploaded - the same real pattern
 * CreatePostScreen's own ComposerVideoPlayer uses, just fed the picked
 * content:// Uri directly rather than an already-uploaded URL.
 */
@OptIn(UnstableApi::class)
@Composable
private fun ShortsUploadPreviewPlayer(uri: Uri, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val exoPlayer = remember(uri) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(uri))
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    AndroidView(
        modifier = modifier,
        factory = {
            PlayerView(context).apply {
                player = exoPlayer
                useController = true
            }
        },
    )
}

private fun queryShortFileNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "video"
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
