package one.zrp.social.mobile.ui.create

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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.GifPickerDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.getPlanLimits

/**
 * The Create tab's composer - a real POST /api/posts call. Photo/video
 * attachment now goes through the exact same real UploadThing protocol
 * the website uses (see UploadThingApi/MediaUploader's own KDocs for
 * how that was reverse-engineered from the actually-installed
 * uploadthing v7.7.4 package, since there's no native/Android SDK for
 * it), reached via Android's built-in Photo Picker
 * (ActivityResultContracts.PickVisualMedia - no runtime permission
 * needed). A GIF still needs no upload at all (it's just a hosted
 * URL); both paths write into the same mediaUrls/mediaType state
 * PostComposer.tsx itself uses, since a GIF really is just one more
 * imageUrls entry there too.
 *
 * When [quotePostId] is set, this doubles as the Quote-post composer
 * reached from a post's repost menu, showing a read-only preview of
 * the real post being quoted - the same real post GET /posts/{id}
 * returns, not a locally reconstructed guess - above the text field,
 * matching the website's QuotePostModal. QuotePostModal.tsx has no GIF
 * picker or media upload of its own (confirmed by reading the
 * component), so neither button shows for the quote-post variant.
 */
@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
fun CreatePostScreen(onPosted: () -> Unit, quotePostId: String? = null) {
    val viewModel: CreatePostViewModel = viewModel(
        factory = remember(quotePostId) { CreatePostViewModelFactory(PostsRepository(), quotePostId) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    var showGifPicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    // Holds the UTC-midnight millis DatePicker returns for the chosen
    // calendar day while the follow-up TimePicker step is still open -
    // combined with the picked hour/minute once that dialog confirms.
    var pendingDateMillis by remember { mutableStateOf<Long?>(null) }

    val mediaPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
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

    val limits = getPlanLimits(state.plan)
    val maxImages = limits.imagesPerPost.coerceAtMost(4)
    val canAddMoreMedia = maxImages > 0 && state.mediaUrls.size < maxImages && state.mediaType != "video"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        if (quotePostId != null) {
            // "Quote Post" stays English-only on purpose - matches
            // QuotePostModal.tsx's own hardcoded, untranslated title.
            Text(
                text = "Quote Post",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = Spacing.sm),
            )

            val quotedPost = state.quotedPost
            when {
                state.isLoadingQuotedPost -> {
                    Box(modifier = Modifier.fillMaxWidth().padding(Spacing.md), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                quotedPost != null -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.medium)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .padding(Spacing.md),
                    ) {
                        Avatar(
                            url = quotedPost.author.avatarUrl,
                            name = quotedPost.author.name ?: quotedPost.author.username,
                            size = 32.dp,
                        )
                        Column(modifier = Modifier.padding(start = Spacing.sm)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = quotedPost.author.name ?: quotedPost.author.username,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                VerifiedBadge(
                                    badgeType = quotedPost.author.badgeType,
                                    modifier = Modifier.padding(start = 3.dp),
                                )
                            }
                            Text(
                                text = quotedPost.content,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }
            }
        }

        OutlinedTextField(
            value = state.content,
            onValueChange = { viewModel.onContentChange(it) },
            // The quote-post placeholder ("Add your thoughts...") stays
            // English-only on purpose too - QuotePostModal.tsx's own
            // placeholder is hardcoded the same way. The default placeholder
            // uses PostComposer.tsx's real, translated copy.
            placeholder = {
                Text(if (quotePostId != null) "Add your thoughts..." else stringResource(R.string.composer_placeholder_default))
            },
            enabled = !state.isPosting,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(top = if (quotePostId != null) Spacing.sm else 0.dp),
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

        if (state.mediaUrls.isNotEmpty()) {
            ComposerMediaPreview(
                urls = state.mediaUrls,
                isVideo = state.mediaType == "video",
                onRemove = { index -> viewModel.onRemoveMediaAt(index) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
            )
        }

        val mediaError = state.mediaError
        if (mediaError != null) {
            Text(
                text = mediaErrorMessage(mediaError),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .clickable { viewModel.dismissMediaError() },
            )
        }

        if (quotePostId == null) {
            // Matches PostComposer.tsx's own schedule section: a
            // pill-style toggle (Clock icon + "Schedule"/"Scheduling
            // on") plus, once toggled on, the picked date/time itself.
            // QuotePostModal.tsx has no scheduling of its own (confirmed
            // by reading the component), so this whole row is hidden
            // for the quote-post variant, matching that real absence.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val isScheduling = state.isScheduling
                val scheduleColors = if (isScheduling) {
                    ButtonDefaults.outlinedButtonColors(contentColor = ZrpRed)
                } else {
                    ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedButton(
                    onClick = {
                        viewModel.onToggleSchedule()
                        if (!isScheduling) showDatePicker = true
                    },
                    enabled = !state.isPosting,
                    colors = scheduleColors,
                ) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(if (isScheduling) stringResource(R.string.composer_schedule_on) else stringResource(R.string.composer_schedule))
                }

                val scheduledAtMillis = state.scheduledAtMillis
                if (isScheduling && scheduledAtMillis != null) {
                    Text(
                        text = SimpleDateFormat("MMM d, yyyy · h:mm a", Locale.getDefault()).format(scheduledAtMillis),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(MaterialTheme.shapes.small).clickable { showDatePicker = true }.padding(4.dp),
                    )
                }
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

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (quotePostId == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The real photo/video attach button - PostComposer.tsx's
                    // own equivalent (an Image icon) is icon-only too, with a
                    // dynamically-built, deliberately untranslated title
                    // ("{n}/{max} media" or "Media unavailable for this
                    // plan") rather than a translated tooltip string, which
                    // this content description matches exactly rather than
                    // inventing a translated key the website doesn't have.
                    IconButton(
                        onClick = {
                            mediaPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo),
                            )
                        },
                        enabled = !state.isPosting && !state.isUploading && canAddMoreMedia,
                    ) {
                        Icon(
                            Icons.Filled.AddAPhoto,
                            contentDescription = if (maxImages > 0) {
                                "${state.mediaUrls.size}/$maxImages media"
                            } else {
                                "Media unavailable for this plan"
                            },
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    // PostComposer.tsx's own GIF button is icon-only too (a
                    // FileImage icon with no visible label), with a real,
                    // translated tooltip via t("composer.addGif") - the
                    // native equivalent of a tooltip is this button's
                    // accessibility content description.
                    IconButton(
                        onClick = { showGifPicker = true },
                        enabled = !state.isPosting && !state.isUploading && canAddMoreMedia,
                    ) {
                        Icon(
                            Icons.Filled.Image,
                            contentDescription = stringResource(R.string.composer_add_gif),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                Spacer(modifier = Modifier.size(1.dp))
            }

            Text(
                text = "${state.content.length} characters",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Button(
                onClick = { viewModel.submit() },
                enabled = (state.content.isNotBlank() || state.mediaUrls.isNotEmpty()) &&
                    !(state.isScheduling && state.scheduledAtMillis == null) &&
                    !state.isPosting &&
                    !state.isUploading,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            ) {
                if (state.isPosting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    // "Quote" (the quote-post case) stays English-only on
                    // purpose too - QuotePostModal.tsx's own submit button
                    // is hardcoded the same way.
                    Text(if (quotePostId != null) "Quote" else stringResource(R.string.composer_post_button))
                }
            }
        }
    }

    if (showGifPicker) {
        GifPickerDialog(
            onDismiss = { showGifPicker = false },
            onSelect = { gif ->
                viewModel.onGifSelected(gif)
                showGifPicker = false
            },
        )
    }

    // Android has no single widget matching HTML's <input
    // type="datetime-local">, so the real datetime-local value web
    // collects in one field is built here from two native Material3
    // steps in sequence - a date step, then a time step. Cancelling
    // either step turns scheduling back off rather than leaving the
    // toggle stuck on with nothing picked.
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = {
                showDatePicker = false
                if (state.isScheduling && state.scheduledAtMillis == null) viewModel.onToggleSchedule()
            },
            confirmButton = {
                TextButton(onClick = {
                    val millis = datePickerState.selectedDateMillis
                    showDatePicker = false
                    if (millis != null) {
                        pendingDateMillis = millis
                        showTimePicker = true
                    } else if (state.isScheduling && state.scheduledAtMillis == null) {
                        viewModel.onToggleSchedule()
                    }
                }) {
                    Text(stringResource(android.R.string.ok))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showDatePicker = false
                    if (state.isScheduling && state.scheduledAtMillis == null) viewModel.onToggleSchedule()
                }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (showTimePicker) {
        val timePickerState = rememberTimePickerState()
        AlertDialog(
            onDismissRequest = {
                showTimePicker = false
                if (state.isScheduling && state.scheduledAtMillis == null) viewModel.onToggleSchedule()
            },
            confirmButton = {
                TextButton(onClick = {
                    val dateMillis = pendingDateMillis
                    showTimePicker = false
                    if (dateMillis != null) {
                        // DatePicker returns the chosen calendar day as
                        // UTC-midnight millis regardless of device
                        // timezone; combined here with the chosen
                        // hour/minute in the device's own timezone to
                        // produce the actual local wall-clock instant
                        // the user picked.
                        val utcCal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
                        utcCal.timeInMillis = dateMillis
                        val localCal = Calendar.getInstance()
                        localCal.set(
                            utcCal.get(Calendar.YEAR),
                            utcCal.get(Calendar.MONTH),
                            utcCal.get(Calendar.DAY_OF_MONTH),
                            timePickerState.hour,
                            timePickerState.minute,
                            0,
                        )
                        localCal.set(Calendar.MILLISECOND, 0)
                        viewModel.onScheduledAtSelected(localCal.timeInMillis)
                    }
                }) {
                    Text(stringResource(android.R.string.ok))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showTimePicker = false
                    if (state.isScheduling && state.scheduledAtMillis == null) viewModel.onToggleSchedule()
                }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
            text = {
                Surface {
                    TimePicker(state = timePickerState)
                }
            },
        )
    }
}

@Composable
private fun mediaErrorMessage(error: MediaValidationError): String = when (error) {
    is MediaValidationError.AlreadyUploaded -> stringResource(R.string.composer_err_already_uploaded, error.maxImages)
    is MediaValidationError.FileTooLarge -> stringResource(R.string.composer_err_file_too_large, error.maxMb)
    is MediaValidationError.OnlyMedia -> stringResource(R.string.composer_err_only_media)
    is MediaValidationError.GifLimit -> stringResource(R.string.composer_err_gif_limit, error.maxImages)
    is MediaValidationError.UploadFailed ->
        stringResource(R.string.composer_err_upload_failed) + ": " + error.detail
}

/**
 * Mirrors PostComposer.tsx's own preview grid: a single video (with
 * playback controls, matching web's real `<video controls>`) or up to
 * four images/GIFs in a simple grid, each with its own real,
 * untranslated "Remove image {n}" / "Remove video" button matching the
 * website's own aria-labels exactly.
 */
@OptIn(UnstableApi::class)
@Composable
private fun ComposerMediaPreview(
    urls: List<String>,
    isVideo: Boolean,
    onRemove: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (isVideo) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(240.dp)
                .clip(MaterialTheme.shapes.medium)
                .background(Color.Black),
        ) {
            ComposerVideoPlayer(url = urls[0], modifier = Modifier.fillMaxSize())
            IconButton(
                onClick = { onRemove(0) },
                modifier = Modifier.align(Alignment.TopEnd).padding(Spacing.xs),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Remove video", tint = Color.White)
            }
        }
        return
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        urls.chunked(2).forEachIndexed { rowIndex, rowUrls ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                rowUrls.forEachIndexed { colIndex, url ->
                    val index = rowIndex * 2 + colIndex
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(if (urls.size == 1) 280.dp else 140.dp)
                            .clip(MaterialTheme.shapes.medium),
                    ) {
                        AsyncImage(
                            model = url,
                            contentDescription = "Upload preview ${index + 1}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                        IconButton(
                            onClick = { onRemove(index) },
                            modifier = Modifier.align(Alignment.TopEnd).padding(4.dp),
                        ) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = "Remove image ${index + 1}",
                                tint = Color.White,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * A real, playable preview with ExoPlayer's own transport controls
 * visible - the native equivalent of web's `<video controls playsInline>`
 * in the composer (distinct from PostVideoPlayer's tap-to-play, muted,
 * feed-style playback used for published posts).
 */
@OptIn(UnstableApi::class)
@Composable
private fun ComposerVideoPlayer(url: String, modifier: Modifier = Modifier) {
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
        modifier = modifier,
        factory = {
            PlayerView(context).apply {
                player = exoPlayer
                useController = true
            }
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
