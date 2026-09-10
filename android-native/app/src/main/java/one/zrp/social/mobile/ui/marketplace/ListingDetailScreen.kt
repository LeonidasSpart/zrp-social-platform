package one.zrp.social.mobile.ui.marketplace

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * A single listing - the same real image carousel, description, seller
 * card, and favorite/share/report/contact-seller actions as
 * ListingDetailPage, including the owner-only "Edit Listing" link in
 * place of Contact Seller (matching web's own isOwner branch exactly).
 */
@OptIn(UnstableApi::class)
@Composable
fun ListingDetailScreen(
    listingId: String,
    onBack: () -> Unit,
    onOpenSeller: (String) -> Unit,
    onMessageSeller: (userId: String, username: String) -> Unit,
    onEditListing: (String) -> Unit,
) {
    val viewModel: ListingDetailViewModel = viewModel(
        factory = remember { ListingDetailViewModelFactory(listingId, MarketplaceRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

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
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.listing == null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.marketplace_listing_not_found),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = onBack, modifier = Modifier.padding(top = Spacing.md)) {
                        Text(stringResource(R.string.marketplace_back_to_marketplace))
                    }
                }
            }
            else -> {
                val listing = state.listing!!
                val isOwner = state.ownUserId == listing.seller.id

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = Spacing.lg),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(4f / 3f)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                    ) {
                        if (listing.imageUrls.isNotEmpty()) {
                            AsyncImage(
                                model = listing.imageUrls[state.activeImageIndex],
                                contentDescription = listing.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Icon(
                                categoryIcon(listing.category),
                                contentDescription = listing.title,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(Spacing.xxl),
                            )
                        }
                        if (listing.imageUrls.size > 1) {
                            IconButton(
                                onClick = viewModel::onPreviousImage,
                                modifier = Modifier.align(Alignment.CenterStart),
                            ) {
                                Icon(
                                    Icons.Filled.ChevronLeft,
                                    contentDescription = stringResource(R.string.marketplace_previous_image),
                                    tint = Color.White,
                                )
                            }
                            IconButton(
                                onClick = viewModel::onNextImage,
                                modifier = Modifier.align(Alignment.CenterEnd),
                            ) {
                                Icon(
                                    Icons.Filled.ChevronRight,
                                    contentDescription = stringResource(R.string.marketplace_next_image),
                                    tint = Color.White,
                                )
                            }
                        }
                    }

                    if (listing.imageUrls.size > 1) {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                            modifier = Modifier.padding(top = Spacing.xs),
                        ) {
                            items(listing.imageUrls.withIndex().toList(), key = { (index, _) -> index }) { (index, url) ->
                                AsyncImage(
                                    model = url,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable(role = Role.Button) { viewModel.onImageSelect(index) },
                                )
                            }
                        }
                    }

                    // ListingDetail already carries the real videoUrl the
                    // backend returns (Listing.videoUrl in prisma/schema.prisma,
                    // surfaced verbatim by GET /listings/{id}) and
                    // ListingCardView already shows a play badge for it -
                    // this was the one place in the chain that never
                    // actually rendered it, silently dropping the video
                    // while photos kept working fine.
                    if (listing.videoUrl != null) {
                        ListingVideoPlayer(
                            url = listing.videoUrl,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    }

                    Text(
                        text = categoryLabel(listing.category),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = ZrpRed,
                        modifier = Modifier.padding(top = Spacing.md),
                    )
                    Text(
                        text = listing.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = formatListingPrice(listing.price, listing.currency, listing.priceOnRequest),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = Spacing.sm),
                    ) {
                        if (listing.location != null) {
                            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(
                                text = listing.location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 2.dp, end = Spacing.md),
                            )
                        }
                        Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(
                            text = stringResource(R.string.marketplace_views_count, listing.views),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 2.dp),
                        )
                    }

                    Row(modifier = Modifier.padding(top = Spacing.md)) {
                        OutlinedButton(onClick = viewModel::toggleFavorite) {
                            Icon(
                                if (state.favorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = null,
                                tint = if (state.favorited) ZrpRed else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = "${stringResource(if (state.favorited) R.string.marketplace_favorited else R.string.marketplace_favorite)} · ${state.favoriteCount}",
                                modifier = Modifier.padding(start = Spacing.xs),
                            )
                        }
                        OutlinedButton(
                            onClick = {
                                val url = "https://zrp.one/marketplace/listing/${listing.id}"
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, url)
                                }
                                context.startActivity(Intent.createChooser(shareIntent, null))
                            },
                            modifier = Modifier.padding(start = Spacing.sm),
                        ) {
                            Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text(stringResource(R.string.marketplace_share), modifier = Modifier.padding(start = Spacing.xs))
                        }
                        if (!isOwner) {
                            IconButton(onClick = viewModel::onOpenReport, modifier = Modifier.padding(start = Spacing.xs)) {
                                Icon(
                                    Icons.Filled.Flag,
                                    contentDescription = stringResource(R.string.report_modal_title),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.marketplace_description),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.lg),
                    )
                    Text(
                        text = listing.description,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.lg, bottom = Spacing.xl)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerLow)
                            .padding(Spacing.md),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable(role = Role.Button) { onOpenSeller(listing.seller.username) },
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                            ) {
                                if (listing.seller.avatarUrl != null) {
                                    AsyncImage(
                                        model = listing.seller.avatarUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(
                                        Icons.Filled.Person,
                                        contentDescription = null,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(Spacing.sm),
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = listing.seller.name ?: listing.seller.username,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f, fill = false),
                                    )
                                    if (listing.seller.badgeType != null) {
                                        VerifiedBadge(
                                            badgeType = listing.seller.badgeType,
                                        )
                                    }
                                }
                                Text(
                                    text = "@${listing.seller.username}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        if (listing.seller.badgeType != null) {
                            Text(
                                text = stringResource(R.string.marketplace_verified_seller),
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF15803D),
                                modifier = Modifier.padding(top = Spacing.sm),
                            )
                        }

                        if (isOwner) {
                            OutlinedButton(
                                onClick = { onEditListing(listing.id) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = Spacing.md),
                            ) {
                                Text(stringResource(R.string.marketplace_edit_listing))
                            }
                        } else {
                            Button(
                                onClick = { onMessageSeller(listing.seller.id, listing.seller.username) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = Spacing.md),
                            ) {
                                Icon(Icons.Filled.MailOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text(
                                    text = stringResource(R.string.marketplace_contact_seller),
                                    modifier = Modifier.padding(start = Spacing.xs),
                                )
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.marketplace_safety_tip),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = Spacing.xl),
                    )
                }
            }
        }
    }

    if (state.isReportOpen) {
        ReportDialog(
            isSubmitting = state.isReportSubmitting,
            error = state.reportError,
            onDismiss = viewModel::onCancelReport,
            onSubmit = { reason, details -> viewModel.submitReport(reason, details) },
        )
    }

    val reportSubmittedText = stringResource(R.string.marketplace_report_submitted)
    LaunchedEffect(state.message) {
        if (state.message == "reportSubmitted") {
            Toast.makeText(context, reportSubmittedText, Toast.LENGTH_LONG).show()
            viewModel.consumeMessage()
        }
    }
}

// Real ExoPlayer-backed video for a listing's own uploaded video -
// same media3 setup and same rotation-aware aspect-ratio correction as
// PostCard.kt's own PostVideoPlayer (VideoSize.width/height are the
// CODED frame dimensions, not the displayed ones, so a portrait phone
// shot carrying 90/270 rotation metadata must swap width/height before
// it drives the outer Box's shape - otherwise the correctly-rotated
// video ends up shrunk and letterboxed inside a landscape-shaped box).
// Unlike PostVideoPlayer this mirrors ListingDetailPage.tsx's own plain
// <video controls> element exactly: real playback controls, not
// autoplaying, not muted, and no separate full-screen viewer to open -
// a listing has exactly one video, not a swipeable feed of them.
@OptIn(UnstableApi::class)
@Composable
private fun ListingVideoPlayer(url: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var aspectRatio by remember(url) { mutableStateOf(16f / 9f) }

    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            playWhenReady = false
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    val rotated = videoSize.unappliedRotationDegrees == 90 || videoSize.unappliedRotationDegrees == 270
                    val displayWidth = if (rotated) videoSize.height else videoSize.width
                    val displayHeight = if (rotated) videoSize.width else videoSize.height
                    aspectRatio = displayWidth.toFloat() / displayHeight.toFloat()
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(aspectRatio)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                PlayerView(context).apply {
                    player = exoPlayer
                    useController = true
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
        )
    }
}
