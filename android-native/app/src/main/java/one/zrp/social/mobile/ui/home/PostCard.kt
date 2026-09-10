package one.zrp.social.mobile.ui.home

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LinkPreviewRepository
import one.zrp.social.mobile.data.PostViewRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LinkPreview
import one.zrp.social.mobile.network.Poll
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.ReactionToggleRequest
import one.zrp.social.mobile.network.TranslateRequest
import one.zrp.social.mobile.ui.components.AddReactionDialog
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.LinkifiedText
import one.zrp.social.mobile.ui.components.BadgeSize
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.ZrpBlue
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.ViewedPostsTracker
import one.zrp.social.mobile.util.formatCount
import one.zrp.social.mobile.util.formatRelativeTime
import one.zrp.social.mobile.util.parseIsoMillis
import one.zrp.social.mobile.util.pollOptionFraction
import one.zrp.social.mobile.util.pollOptionPercentage
import java.text.DateFormat
import java.util.Locale

// The exact same video-vs-image heuristic PostCard.tsx itself uses
// (mediaType, URL extension, and URL path patterns together, since
// storage/CDN URLs often carry no file extension at all) - ported
// field-for-field from the real component rather than guessed, so a
// post that plays as a video on web plays as one here too.
private val imageExtensions = setOf(
    "jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp", "tif", "tiff", "heic", "heif",
)
private val videoExtensions = setOf(
    "mp4", "webm", "mov", "avi", "mkv", "m4v", "3gp", "3g2", "ogv", "mpeg", "mpg", "m2v", "ts",
)

// Ported field-for-field from src/lib/link-preview-parse.ts's own
// extractFirstUrl(): finds the first http(s)/www URL in free-form post
// text, trims plain trailing sentence punctuation, then only strips a
// trailing ')' when it isn't balanced by a still-open '(' earlier in
// the same URL - the same bracket-balance heuristic that keeps a
// Wikipedia-style .../wiki/Example_(disambiguation) link intact.
private val FIRST_URL_REGEX = Regex("""(https?://\S+)|(www\.\S+)""")
private val FIRST_URL_TRAILING_PUNCTUATION = Regex("""[.,!?;:'"\]}]+$""")

// Matches PostCard.tsx's own CONTENT_TRUNCATE_LENGTH exactly.
private const val POST_CONTENT_TRUNCATE_LENGTH = 280

private fun extractFirstUrl(content: String): String? {
    val match = FIRST_URL_REGEX.find(content) ?: return null
    var raw = match.value.replace(FIRST_URL_TRAILING_PUNCTUATION, "")

    while (raw.endsWith(")")) {
        val opens = raw.count { it == '(' }
        val closes = raw.count { it == ')' }
        if (closes <= opens) break
        raw = raw.dropLast(1)
    }

    return if (raw.startsWith("http")) raw else "https://$raw"
}

private fun normalizeMediaType(value: String?): String =
    (value ?: "").trim().lowercase().replace(Regex("\\s+"), "")

private fun getMediaPath(url: String?): String {
    if (url.isNullOrEmpty()) return ""
    return url.lowercase().substringBefore('?').substringBefore('#')
}

private fun isGifMedia(url: String?, mediaType: String?): Boolean {
    val type = normalizeMediaType(mediaType)
    val path = getMediaPath(url)
    return path.endsWith(".gif") || type == "gif" || type == "image/gif"
}

private fun isExplicitVideoMediaType(mediaType: String?): Boolean {
    val type = normalizeMediaType(mediaType)
    return type == "video" || type == "videos" || type == "movie" ||
        type == "video/mp4" || type == "video/webm" || type == "video/mov" ||
        type == "video/quicktime" || type.startsWith("video/")
}

private fun isExplicitImageMediaType(mediaType: String?): Boolean {
    val type = normalizeMediaType(mediaType)
    return type == "image" || type == "images" || type == "photo" || type == "picture" ||
        type.startsWith("image/")
}

private fun isVideoPost(post: Post): Boolean {
    val mediaUrl = post.imageUrl ?: ""
    val mediaPath = getMediaPath(mediaUrl)
    val isGif = isGifMedia(post.imageUrl, post.mediaType)
    val isImageGallery = (post.imageUrls?.size ?: 0) > 1
    val hasImageExtension = imageExtensions.any { mediaPath.endsWith(".$it") }
    val hasVideoExtension = videoExtensions.any { mediaPath.endsWith(".$it") }

    return !isGif && !isImageGallery && !isExplicitImageMediaType(post.mediaType) &&
        (
            isExplicitVideoMediaType(post.mediaType) ||
                hasVideoExtension ||
                (
                    !hasImageExtension &&
                        (
                            mediaUrl.contains("/video/") ||
                                mediaUrl.contains("/videos/") ||
                                mediaUrl.contains("/media/video/") ||
                                mediaUrl.contains("/uploads/video/") ||
                                mediaUrl.contains("video=true")
                        )
                )
        )
}

/**
 * The native app's own post card - not a copy of any of the website's
 * feed markup, but showing the exact same real fields (author, media,
 * counts, like state) the website's post cards render, from the same
 * backend response.
 *
 * Localization audit note: every visible string in this file was
 * cross-referenced against the real PostCard.tsx. None need a
 * translated resource - each one is either a byte-for-byte match of
 * web's own hardcoded, untranslated copy (Pin/Unpin, Show original/
 * Show translation, Translation unavailable, Undo Repost/Repost/Quote,
 * the reposts/quotes counts) or a native-only accessibility label
 * (Edit/Delete/Report post, Comments, Add reaction, Like/Unlike,
 * Bookmark, Repost options) that web's own icon-only buttons have no
 * aria-label/title for either - confirmed by reading the component
 * directly rather than assumed.
 */
@Composable
fun PostCard(
    post: Post,
    onLikeClick: (String) -> Unit,
    onCommentClick: (String) -> Unit,
    onRepostClick: (String) -> Unit,
    onClick: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit = {},
    onBookmarkClick: (String) -> Unit = {},
    onReportClick: (String) -> Unit = {},
    isOwnPost: Boolean = false,
    onDeleteClick: (String) -> Unit = {},
    onEditClick: (String) -> Unit = {},
    onQuoteClick: (String) -> Unit = {},
    onViewReposts: (String) -> Unit = {},
    onViewQuotes: (String) -> Unit = {},
    // Matches PostCard.tsx's own video area: tapping it (anywhere but
    // the mute button) opens the real full-screen swipeable video feed
    // (VideoFeedViewer on web, ShortsScreen here), not an inline
    // play/pause toggle - see PostVideoPlayer's own KDoc.
    onOpenVideoViewer: (String) -> Unit = {},
    // Pin to profile - the website only offers this from the Profile
    // screen itself (showPinOption there is isOwnProfile; every other
    // surface that renders PostCard - Home, Search, Bookmarks, Quotes -
    // never passes it), so it defaults off everywhere else too.
    showPinOption: Boolean = false,
    isPinned: Boolean = false,
    onPinClick: (String) -> Unit = {},
    // Poll voting - postId and pollId both passed since the vote
    // endpoint is keyed on the poll, not the post, but the ViewModel
    // still needs postId to know which Post in its own list to update.
    onVoteClick: (postId: String, pollId: String, optionIndex: Int) -> Unit = { _, _, _ -> },
) {
    // Translation is purely local, ephemeral per-card UI state on the
    // website too (PostCard.tsx's own translatedText/showTranslation/
    // translating/translateError useState calls, never lifted to a
    // parent post-list) - kept the same way here rather than threaded
    // through a ViewModel, since it never needs to survive this card
    // leaving composition.
    val coroutineScope = rememberCoroutineScope()
    var translatedText by remember(post.id) { mutableStateOf<String?>(null) }
    var showTranslation by remember(post.id) { mutableStateOf(false) }
    var translating by remember(post.id) { mutableStateOf(false) }
    var translateError by remember(post.id) { mutableStateOf(false) }
    var contentExpanded by remember(post.id) { mutableStateOf(false) }

    fun handleTranslate() {
        if (translatedText != null) {
            showTranslation = !showTranslation
            return
        }
        translating = true
        translateError = false
        coroutineScope.launch {
            try {
                // The website sends its viewer's site-wide UI language
                // preference as targetLang; native has no such setting
                // (the app is English-only, no i18n), so the device's
                // own locale is the closest real equivalent of "the
                // language this reader actually reads".
                val response = ApiClient.translateApi.translate(
                    TranslateRequest(text = post.content, targetLang = Locale.getDefault().language),
                )
                translatedText = response.translatedText
                showTranslation = true
            } catch (e: Exception) {
                translateError = true
            } finally {
                translating = false
            }
        }
    }

    // Reactions are the same kind of local, per-card state as
    // translation above - PostCard.tsx fetches them per-card via its
    // own useEffect keyed on post.id, never through a shared post-list
    // ViewModel.
    var reactions by remember(post.id) { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var userReaction by remember(post.id) { mutableStateOf<String?>(null) }
    var reactionsLoading by remember(post.id) { mutableStateOf(true) }
    var showAddReactionDialog by remember(post.id) { mutableStateOf(false) }

    // Matches PostCard.tsx's own galleryImages precedence: the real,
    // multi-image imageUrls array when the post has one, else the single
    // legacy imageUrl wrapped as a one-item list.
    val galleryImages = remember(post.id, post.imageUrls, post.imageUrl) {
        post.imageUrls?.takeIf { it.isNotEmpty() } ?: listOfNotNull(post.imageUrl)
    }
    var lightboxIndex by remember(post.id) { mutableStateOf<Int?>(null) }
    val isVideo = remember(post.id, post.imageUrl, post.mediaType, post.imageUrls) { isVideoPost(post) }

    // Matches PostCard.tsx's own `post.linkUrl || extractFirstUrl(post.content)` -
    // linkUrl is a real column no current web usage ever sets, so this is
    // effectively always the first URL found in the post's own text.
    // linkPreviewFound is local, ephemeral per-card state (same category
    // as translation/reactions above) tracking whether LinkPreviewBlock
    // actually found something to show for it, so the matching raw URL
    // token in the post's own LinkifiedText body is hidden only once
    // there's really a card standing in for it - not merely because a
    // URL-shaped candidate exists.
    val previewUrl = remember(post.id, post.linkUrl, post.content) {
        post.linkUrl ?: extractFirstUrl(post.content)
    }
    var linkPreviewFound by remember(post.id) { mutableStateOf(false) }

    // Matches PostCard.tsx's own view-count effect: fires once per post
    // per app-process lifetime (ViewedPostsTracker), not gated by scroll
    // visibility or media type - every post counts a view as soon as its
    // card is first composed, the same as web counts one on mount. Local
    // per-card state, same category as translation/reactions above -
    // the real count is never lifted into any ViewModel's own post list.
    var viewsCount by remember(post.id) { mutableStateOf(post.views) }
    val postViewRepository = remember { PostViewRepository() }
    LaunchedEffect(post.id) {
        if (ViewedPostsTracker.markViewed(post.id)) {
            postViewRepository.recordView(post.id).getOrNull()?.views?.let { viewsCount = it }
        }
    }

    suspend fun refreshReactions() {
        try {
            val currentUserId = runCatching { ApiClient.authApi.getSession().user?.id }.getOrNull()
            val list = ApiClient.postsApi.getReactions(post.id)
            reactions = list.groupingBy { it.emoji }.eachCount()
            userReaction = list.firstOrNull { it.user.id == currentUserId }?.emoji
        } catch (e: Exception) {
            // The website only console.errors a failed fetch too - no
            // user-facing error state for reactions, unlike translation.
        } finally {
            reactionsLoading = false
        }
    }

    LaunchedEffect(post.id) {
        refreshReactions()
    }

    fun handleReaction(emoji: String) {
        coroutineScope.launch {
            try {
                ApiClient.postsApi.toggleReaction(post.id, ReactionToggleRequest(emoji))
                refreshReactions()
                showAddReactionDialog = false
            } catch (e: Exception) {
                // Same silent handling as the website's own catch block.
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(post.id) }
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(
                url = post.author.avatarUrl,
                name = post.author.name ?: post.author.username,
                size = 48.dp,
                modifier = Modifier.clickable { onAuthorClick(post.author.username) },
            )

            Spacer(modifier = Modifier.width(Spacing.md))

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onAuthorClick(post.author.username) },
                    ) {
                        Text(
                            text = post.author.name ?: post.author.username,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                        VerifiedBadge(badgeType = post.author.badgeType)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "@${post.author.username}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "· ${formatRelativeTime(post.createdAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }

                    // The website's shared PostCard.tsx shows Edit+Delete
                    // for the post's own author and Report for everyone
                    // else, on every screen it renders on (Home, Profile,
                    // Bookmarks, Search, post detail, hashtag, explore) -
                    // isOwnPost mirrors that same isAuthor check
                    // everywhere this PostCard is used too, each screen's
                    // ViewModel resolving the signed-in user's real id via
                    // GET /auth/session the same way ProfileViewModel
                    // already did.
                    if (isOwnPost) {
                        if (showPinOption) {
                            IconButton(onClick = { onPinClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                                Icon(
                                    imageVector = if (isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                                    contentDescription = stringResource(if (isPinned) R.string.post_unpin_cd else R.string.post_pin_cd),
                                    tint = if (isPinned) ZrpBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(IconSize.sm),
                                )
                            }
                        }
                        IconButton(onClick = { onEditClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Edit,
                                contentDescription = stringResource(R.string.post_edit_cd),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                        IconButton(onClick = { onDeleteClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.DeleteOutline,
                                contentDescription = stringResource(R.string.post_delete_cd),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    } else {
                        IconButton(onClick = { onReportClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Flag,
                                contentDescription = stringResource(R.string.post_report_cd),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    }
                }

                if (post.content.isNotBlank()) {
                    // Matches PostCard.tsx's own CONTENT_TRUNCATE_LENGTH
                    // (280) exactly - the full post.content is always
                    // kept in memory and passed to every action below
                    // (edit, translate, share); only the rendered text
                    // is ever shortened, and only until Show more is
                    // tapped. Previously this rendered the entire
                    // content unclamped, unlike every other ZRP surface.
                    val isLongContent = post.content.length > POST_CONTENT_TRUNCATE_LENGTH
                    val displayedContent = if (isLongContent && !contentExpanded) {
                        post.content.take(POST_CONTENT_TRUNCATE_LENGTH) + "..."
                    } else {
                        post.content
                    }
                    LinkifiedText(
                        text = displayedContent,
                        style = MaterialTheme.typography.bodyMedium,
                        onMentionClick = onAuthorClick,
                        onHashtagClick = onHashtagClick,
                        onNonLinkClick = { onClick(post.id) },
                        suppressUrl = if (linkPreviewFound) previewUrl else null,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (isLongContent) {
                        // Byte-for-byte match of web's own hardcoded,
                        // untranslated "Show more"/"Show less" copy -
                        // see this file's own localization note above.
                        Text(
                            text = if (contentExpanded) "Show less" else "Show more",
                            style = MaterialTheme.typography.bodySmall,
                            color = ZrpRed,
                            modifier = Modifier
                                .padding(top = 1.dp)
                                .clickable { contentExpanded = !contentExpanded },
                        )
                    }
                }

                if (isVideo && post.imageUrl != null) {
                    PostVideoPlayer(
                        url = post.imageUrl,
                        onOpenViewer = { onOpenVideoViewer(post.id) },
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                } else if (galleryImages.isNotEmpty()) {
                    PostImageGallery(
                        images = galleryImages,
                        onImageClick = { index -> lightboxIndex = index },
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }

                val quotedPost = post.quotePost
                if (quotedPost != null) {
                    QuotedPostPreview(
                        quotedPost = quotedPost,
                        onClick = { onClick(quotedPost.id) },
                    )
                }

                val poll = post.poll
                if (poll != null) {
                    PollBlock(
                        poll = poll,
                        onVote = { optionIndex -> onVoteClick(post.id, poll.id, optionIndex) },
                    )
                }

                // Matches PostCard.tsx's own render gate exactly:
                // !post.imageUrl && previewUrl - checked against
                // imageUrl specifically, not the multi-image imageUrls
                // array (a quirk of the reference component, not a
                // native bug - see LinkPreviewBlock's own KDoc).
                if (post.imageUrl == null && previewUrl != null) {
                    LinkPreviewBlock(
                        url = previewUrl,
                        onLoaded = { found -> linkPreviewFound = found },
                    )
                }

                if (post.content.isNotBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .padding(top = Spacing.xs)
                            .clickable(enabled = !translating) { handleTranslate() },
                    ) {
                        if (translating) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(14.dp),
                                strokeWidth = 2.dp,
                                color = ZrpRed,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Filled.Translate,
                                contentDescription = null,
                                tint = ZrpRed,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                        Text(
                            text = if (showTranslation) "Show original" else "Show translation",
                            style = MaterialTheme.typography.bodySmall,
                            color = ZrpRed,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }

                    if (translateError) {
                        Text(
                            text = "Translation unavailable right now.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }

                    val shownTranslation = translatedText
                    if (showTranslation && shownTranslation != null) {
                        Text(
                            text = shownTranslation,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp, start = 8.dp),
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.xs),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    PostStat(
                        icon = Icons.Filled.ChatBubbleOutline,
                        count = post._count.comments,
                        contentDescription = stringResource(R.string.post_comments_cd),
                        onClick = { onCommentClick(post.id) },
                    )
                    RepostStat(
                        count = post._count.reposts,
                        quoteCount = post._count.quotedBy ?: 0,
                        reposted = post.reposted == true,
                        onRepostToggle = { onRepostClick(post.id) },
                        onQuoteClick = { onQuoteClick(post.id) },
                        onViewReposts = { onViewReposts(post.id) },
                        onViewQuotes = { onViewQuotes(post.id) },
                    )
                    LikeStat(
                        liked = post.liked == true,
                        count = post._count.likes,
                        onClick = { onLikeClick(post.id) },
                    )
                    ViewsStat(count = viewsCount)
                    BookmarkButton(
                        bookmarked = post.bookmarked == true,
                        onClick = { onBookmarkClick(post.id) },
                    )
                }

                if (!reactionsLoading) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                        modifier = Modifier
                            .padding(top = Spacing.xs)
                            .horizontalScroll(rememberScrollState()),
                    ) {
                        reactions.entries.sortedByDescending { it.value }.forEach { (emoji, count) ->
                            ReactionPill(
                                emoji = emoji,
                                count = count,
                                isOwn = userReaction == emoji,
                                onClick = { handleReaction(emoji) },
                            )
                        }
                        IconButton(onClick = { showAddReactionDialog = true }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Add,
                                contentDescription = stringResource(R.string.post_add_reaction_cd),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    }
                }
            }
        }

        if (showAddReactionDialog) {
            AddReactionDialog(
                onDismiss = { showAddReactionDialog = false },
                onSubmit = { emoji -> handleReaction(emoji) },
            )
        }

        val openLightboxIndex = lightboxIndex
        if (openLightboxIndex != null) {
            ImageLightbox(
                images = galleryImages,
                initialIndex = openLightboxIndex,
                onDismiss = { lightboxIndex = null },
            )
        }

        HorizontalDivider(modifier = Modifier.padding(top = Spacing.md))
    }
}

// The same real image collage PostCard.tsx renders for a multi-image
// post (2 side by side, 3 as one tall + two stacked, 4 as a 2x2 grid,
// capped at 4 images even if more were uploaded) - previously native
// only ever showed post.imageUrl ?: post.imageUrls?.firstOrNull(),
// silently dropping every image after the first for any multi-image
// post. A single-image post keeps the original full-width treatment.
@Composable
private fun PostImageGallery(
    images: List<String>,
    onImageClick: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (images.size == 1) {
        AsyncImage(
            model = images[0],
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.medium)
                .clickable { onImageClick(0) },
        )
        return
    }

    val shown = images.take(4)
    val gap = 2.dp

    Box(modifier = modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)) {
        when (shown.size) {
            2 -> Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                GalleryTile(shown[0], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(0) }
                GalleryTile(shown[1], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(1) }
            }
            3 -> Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                GalleryTile(shown[0], Modifier.weight(1f).aspectRatio(0.5f)) { onImageClick(0) }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(gap)) {
                    GalleryTile(shown[1], Modifier.fillMaxWidth().aspectRatio(1f)) { onImageClick(1) }
                    GalleryTile(shown[2], Modifier.fillMaxWidth().aspectRatio(1f)) { onImageClick(2) }
                }
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    GalleryTile(shown[0], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(0) }
                    GalleryTile(shown[1], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(1) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    GalleryTile(shown[2], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(2) }
                    GalleryTile(shown[3], Modifier.weight(1f).aspectRatio(1f)) { onImageClick(3) }
                }
            }
        }
    }
}

@Composable
private fun GalleryTile(image: String, modifier: Modifier, onClick: () -> Unit) {
    AsyncImage(
        model = image,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.clickable(onClick = onClick),
    )
}

// The same full-screen viewer PostCard.tsx's own image lightbox offers -
// swipe between every real image in the post (mobile web relies on the
// same touch-swipe gesture too; its prev/next chevron buttons are
// desktop-only, "hidden sm:flex", so a swipeable pager alone is genuine
// parity with the actual mobile experience, not a reduced substitute).
// "Close image" matches the real, untranslated aria-label="Close image"
// web's own lightbox close button carries.
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ImageLightbox(images: List<String>, initialIndex: Int, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val pagerState = rememberPagerState(initialPage = initialIndex) { images.size }
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                // Tap the image again to close, matching how every other
                // mobile image viewer behaves - previously the only way
                // out was the small top-right X, which meant scrolling
                // all the way back up to reach it. clickable's tap
                // gesture doesn't fight the pager's own drag-to-swipe
                // gesture, so swiping between images is unaffected.
                AsyncImage(
                    model = images[page],
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable(onClick = onDismiss),
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .padding(Spacing.md),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (images.size > 1) {
                    Text(
                        text = "${pagerState.currentPage + 1} / ${images.size}",
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                    )
                } else {
                    Spacer(modifier = Modifier.size(1.dp))
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.post_close_image_cd), tint = Color.White)
                }
            }
        }
    }
}

// Real ExoPlayer-backed inline video preview for a video post - the
// same media3 setup StoryViewerScreen's own video stories already use.
// Matches PostCard.tsx's real design exactly: the inline <video> itself
// is pointer-events-none (autoplaying muted, looping, no direct
// play/pause control) and tapping anywhere on the video area opens the
// real full-screen swipeable video feed (VideoFeedViewer on web,
// ShortsScreen here - see onOpenViewer) starting at this exact post,
// with only its own separate Mute/Unmute button (bottom-right,
// stopPropagation on web) controlling the inline preview without also
// opening the viewer. Compose's LazyColumn only composes roughly-visible
// items, which stands in for web's IntersectionObserver-driven
// `videoInView` autoplay gate closely enough without plumbing a
// separate visibility system through every screen that renders
// PostCard.
@OptIn(UnstableApi::class)
@Composable
private fun PostVideoPlayer(url: String, onOpenViewer: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var isMuted by remember(url) { mutableStateOf(true) }
    // Web captures the real video's own dimensions (captureVideoAspect)
    // rather than assuming a fixed shape - a vertical phone-shot video
    // is common enough that hardcoding 16:9 would letterbox/crop it.
    var aspectRatio by remember(url) { mutableStateOf(16f / 9f) }

    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
            playWhenReady = true
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    // VideoSize.width/height are the CODED frame
                    // dimensions, not the displayed ones - a phone
                    // shot vertically is very often encoded as a
                    // landscape frame plus a 90/270 rotation flag
                    // (unappliedRotationDegrees), meant to be rotated
                    // at render time. PlayerView's own internal
                    // AspectRatioFrameLayout already accounts for this
                    // when it fits the actual video surface, but this
                    // state feeds the OUTER Compose Box's shape - left
                    // unrotated, that Box came out landscape-shaped for
                    // a portrait video, and RESIZE_MODE_FIT then had no
                    // choice but to shrink the correctly-rotated video
                    // way down to fit inside it, letterboxed on both
                    // sides: the exact "video is tiny inside a huge
                    // black area" bug, and exactly why it only hit
                    // certain videos - the ones with rotation metadata.
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

    LaunchedEffect(isMuted) {
        exoPlayer.volume = if (isMuted) 0f else 1f
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(aspectRatio)
            .background(Color.Black)
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onOpenViewer),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                PlayerView(context).apply {
                    player = exoPlayer
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
        )

        IconButton(
            onClick = { isMuted = !isMuted },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(Spacing.sm),
        ) {
            Icon(
                imageVector = if (isMuted) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                contentDescription = stringResource(if (isMuted) R.string.post_unmute_video_cd else R.string.post_mute_video_cd),
                tint = Color.White,
            )
        }
    }
}

// Each stat's accent color only shows once it's actually active (liked/
// reposted) - matching the website's action bar, where comment=blue,
// repost=green and like=red are hover/active accents on top of a
// neutral gray resting state, not permanent icon colors.
@Composable
private fun PostStat(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    onClick: () -> Unit,
    tint: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
    active: Boolean = false,
) {
    val resolvedTint = if (active) tint else MaterialTheme.colorScheme.onSurfaceVariant
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = resolvedTint,
                modifier = Modifier.size(IconSize.sm),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = resolvedTint,
        )
    }
}

// The website's repost control is a dropdown, not a plain toggle - tap
// opens Repost/Undo Repost alongside Quote (src/components/PostCard.tsx's
// repostDropdownOpen menu), since a repost and a quote-repost are two
// different real actions on the same button, not one collapsed into
// the other.
@Composable
private fun RepostStat(
    count: Int,
    quoteCount: Int,
    reposted: Boolean,
    onRepostToggle: () -> Unit,
    onQuoteClick: () -> Unit,
    onViewReposts: () -> Unit,
    onViewQuotes: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val resolvedTint = if (reposted) ZrpGreen else MaterialTheme.colorScheme.onSurfaceVariant

    Box {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable { menuOpen = true },
        ) {
            IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(TouchTarget.min)) {
                Icon(
                    imageVector = Icons.Filled.Repeat,
                    contentDescription = stringResource(R.string.post_repost_options_cd),
                    tint = resolvedTint,
                    modifier = Modifier.size(IconSize.sm),
                )
            }
            Text(
                text = formatCount(count),
                style = MaterialTheme.typography.bodySmall,
                color = resolvedTint,
            )
        }

        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(if (reposted) R.string.action_undo_repost else R.string.action_repost)) },
                onClick = {
                    menuOpen = false
                    onRepostToggle()
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.post_quote_action)) },
                onClick = {
                    menuOpen = false
                    onQuoteClick()
                },
            )
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text(stringResource(R.string.post_reposts_count, formatCount(count)), style = MaterialTheme.typography.labelSmall) },
                onClick = {
                    menuOpen = false
                    onViewReposts()
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.post_quotes_count, formatCount(quoteCount)), style = MaterialTheme.typography.labelSmall) },
                onClick = {
                    menuOpen = false
                    onViewQuotes()
                },
            )
        }
    }
}

// A compact, tappable preview of the post being quoted - the same real
// author/content/image GET /posts/{id} already nests one level deep
// under quotePost (see Post's own KDoc), not a locally reconstructed
// summary. Bordered rather than filled so it reads as "embedded post"
// distinct from the quoting post's own content above it.
@Composable
private fun QuotedPostPreview(quotedPost: Post, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(
                url = quotedPost.author.avatarUrl,
                name = quotedPost.author.name ?: quotedPost.author.username,
                size = 20.dp,
            )
            Text(
                text = quotedPost.author.name ?: quotedPost.author.username,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .padding(start = Spacing.xs)
                    .weight(1f, fill = false),
            )
            VerifiedBadge(badgeType = quotedPost.author.badgeType, size = BadgeSize.small)
            Text(
                text = "@${quotedPost.author.username}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (quotedPost.content.isNotBlank()) {
            Text(
                text = quotedPost.content,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 2.dp),
                maxLines = 4,
            )
        }
        val quotedPreviewUrl = quotedPost.imageUrl ?: quotedPost.imageUrls?.firstOrNull()
        if (quotedPreviewUrl != null) {
            AsyncImage(
                model = quotedPreviewUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.xs)
                    .clip(MaterialTheme.shapes.medium),
            )
        }
    }
}

// The native equivalent of the website's own (currently unwired into
// PostCard.tsx) Poll.tsx component - real single-select voting against
// POST /api/polls/{id}/vote, single-select and one vote per user
// enforced server-side (PollVote's own [pollId, userId] unique
// constraint), never a second local-only voting system. Mirrors
// Poll.tsx's exact behavior: percentage/count text next to an option
// only appears once `userVoteIndex != null` - NOT merely once the
// poll has expired, so a viewer who never voted on an expired poll
// still sees no results, exactly like the reference component (the
// background proportion bar itself is still drawn behind every option
// regardless, matching Poll.tsx's own unconditional bar render).
@Composable
private fun PollBlock(poll: Poll, onVote: (Int) -> Unit, modifier: Modifier = Modifier) {
    val isExpired = remember(poll.expiresAt) {
        val expiresAtMillis = poll.expiresAt?.let { parseIsoMillis(it) }
        expiresAtMillis != null && expiresAtMillis < System.currentTimeMillis()
    }
    val userVoteIndex = poll.userVoteIndex
    val hasVoted = userVoteIndex != null
    val totalVotes = poll.totalVotes()
    val canVote = !isExpired && !hasVoted

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.sm),
    ) {
        Text(text = poll.question, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)

        Column(
            modifier = Modifier.padding(top = Spacing.xs),
            verticalArrangement = Arrangement.spacedBy(Spacing.xs),
        ) {
            poll.options.forEachIndexed { index, label ->
                val count = poll.voteCount(index)
                val percentage = pollOptionPercentage(count, totalVotes)
                PollOptionRow(
                    label = label,
                    percentage = percentage,
                    count = count,
                    isSelected = userVoteIndex == index,
                    // Matches Poll.tsx's own `selected !== null` gate -
                    // deliberately not `hasVoted || isExpired`.
                    showResult = hasVoted,
                    canVote = canVote,
                    onClick = { onVote(index) },
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.xs),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = pluralStringResource(R.plurals.poll_vote_count, totalVotes, totalVotes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                val expiresAt = poll.expiresAt
                if (isExpired) {
                    Text(
                        text = stringResource(R.string.poll_ended),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (expiresAt != null) {
                    Text(
                        text = stringResource(R.string.poll_ends_label) + " " + formatPollExpiry(expiresAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (hasVoted && !isExpired) {
                    Text(
                        text = stringResource(R.string.poll_voted),
                        style = MaterialTheme.typography.labelSmall,
                        color = ZrpBlue,
                    )
                }
            }
        }
    }
}

@Composable
private fun PollOptionRow(
    label: String,
    percentage: Int,
    count: Int,
    isSelected: Boolean,
    showResult: Boolean,
    canVote: Boolean,
    onClick: () -> Unit,
) {
    val borderColor = if (isSelected) ZrpBlue else MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .background(if (isSelected) ZrpBlue.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface)
            .border(if (isSelected) 2.dp else 1.dp, borderColor, MaterialTheme.shapes.small)
            .then(if (canVote) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        // Background proportion bar - matches Poll.tsx's own
        // unconditional absolute-positioned width:${percentage}% div,
        // drawn regardless of showResult so this Box must size itself
        // from the foreground Row below (matchParentSize), not the
        // reverse.
        Box(modifier = Modifier.matchParentSize()) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(fraction = pollOptionFraction(percentage))
                    .background(ZrpBlue.copy(alpha = 0.12f)),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (showResult) {
                Text(
                    text = stringResource(R.string.poll_option_result, percentage, formatCount(count)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}

// Short, locale-aware date - reference component uses a plain
// toLocaleDateString() with no time component for a poll's own expiry
// display, unlike CreatePostScreen's own datetime-local picker for
// setting it.
private fun formatPollExpiry(iso: String): String {
    val millis = parseIsoMillis(iso) ?: return ""
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(java.util.Date(millis))
}

// The native equivalent of LinkPreviewCard.tsx - same on-demand fetch
// (GET /api/link-preview?url=), same "nothing usable found -> render
// nothing, the plain URL text stays the fallback" behavior (never a
// broken/empty card), same tap target (opens the real page in a
// browser, never an in-app embed even for the video/YouTube case).
// [onLoaded] mirrors the reference component's own onLoaded(found)
// callback, which PostCard uses to decide whether to hide the matching
// raw URL token in its own linkified text.
@Composable
private fun LinkPreviewBlock(url: String, onLoaded: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember { LinkPreviewRepository() }
    var preview by remember(url) { mutableStateOf<LinkPreview?>(null) }
    var loading by remember(url) { mutableStateOf(true) }
    var imageErrored by remember(url) { mutableStateOf(false) }

    LaunchedEffect(url) {
        loading = true
        imageErrored = false
        val data = repository.getLinkPreview(url).getOrNull()
        val found = data != null && (data.title != null || data.image != null)
        preview = if (found) data else null
        loading = false
        onLoaded(found)
    }

    if (loading) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm)
                .clip(MaterialTheme.shapes.medium)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.91f)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow),
            )
        }
        return
    }

    val data = preview ?: return

    val domain = remember(data) {
        data.siteName?.takeIf { it.isNotBlank() } ?: try {
            java.net.URI(data.url).host?.removePrefix("www.") ?: ""
        } catch (e: Exception) {
            ""
        }
    }
    // isVideo covers any publisher whose own page metadata says so, not
    // just YouTube - matching LinkPreviewCard.tsx's own isVideo/isYouTube
    // check exactly. This is purely a visual play-icon affordance; the
    // card still only ever opens the real target page, never an embed.
    val isYouTube = data.siteName == "YouTube"
    val showPlayIcon = data.isVideo || isYouTube

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
            .clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(data.url)))
            },
    ) {
        if (data.image != null && !imageErrored) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.91f)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow),
            ) {
                AsyncImage(
                    model = data.image,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    onError = { imageErrored = true },
                    modifier = Modifier.fillMaxSize(),
                )
                if (showPlayIcon) {
                    Box(modifier = Modifier.matchParentSize(), contentAlignment = Alignment.Center) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(ZrpRed.copy(alpha = 0.9f))
                                .padding(Spacing.sm),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                            )
                        }
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(Spacing.sm)) {
            if (domain.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.OpenInNew,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = domain.uppercase(Locale.getDefault()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
            }
            val title = data.title
            if (!title.isNullOrBlank()) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            val description = data.description
            if (!description.isNullOrBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

// The one moment on this screen worth a deliberate flourish: liking a
// post pops the heart briefly past full size before it settles, the
// same "felt" acknowledgement every reference feed app gives this
// specific action. Keyed off an actual liked:false -> true transition
// (not the raw value) so a post that was already liked before this
// card even entered composition - e.g. scrolling back up the feed -
// never re-triggers it on mount.
@Composable
private fun LikeStat(liked: Boolean, count: Int, onClick: () -> Unit) {
    var wasLiked by remember { mutableStateOf(liked) }
    val scale = remember { Animatable(1f) }

    LaunchedEffect(liked) {
        if (liked && !wasLiked) {
            scale.snapTo(0.7f)
            scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        }
        wasLiked = liked
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
            Icon(
                imageVector = if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = stringResource(if (liked) R.string.action_unlike else R.string.action_like),
                tint = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(IconSize.sm)
                    .scale(scale.value),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// Matches PostCard.tsx's own VIEWS span exactly: shown on every post to
// every viewer (not author-gated, unlike Pin/Edit/Delete), a plain
// non-interactive stat rather than a button - no click target, no
// dropdown, nothing to toggle. The website spells the count out in full
// in its title tooltip; contentDescription does the same job here for a
// screen reader, while the visible text stays the same abbreviated
// formatCount() every other stat in this row uses.
@Composable
private fun ViewsStat(count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Filled.BarChart,
            contentDescription = pluralStringResource(R.plurals.post_views_count, count, count),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .size(TouchTarget.min)
                .padding((TouchTarget.min - IconSize.sm) / 2),
        )
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// No count shown, matching the website's own bookmark control (a
// plain toggle icon, never a bookmark tally next to a post).
@Composable
private fun BookmarkButton(bookmarked: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
        Icon(
            imageVector = if (bookmarked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            contentDescription = stringResource(if (bookmarked) R.string.action_remove_bookmark else R.string.action_bookmark),
            tint = if (bookmarked) ZrpBlue else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(IconSize.sm),
        )
    }
}

// One pill per distinct emoji already on the post (website: a rounded
// button per emoji key in the reduced reaction counts, tapping any of
// them - including a different emoji than your own - calls the same
// toggle endpoint for that specific emoji, exactly mirrored here rather
// than restricting taps to only your own reaction, a restriction the
// real UI doesn't have.
@Composable
private fun ReactionPill(emoji: String, count: Int, isOwn: Boolean, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(MaterialTheme.shapes.extraLarge)
            .background(if (isOwn) ZrpRed.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceContainerHigh)
            .border(1.dp, if (isOwn) ZrpRed else MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.extraLarge)
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.sm, vertical = 4.dp),
    ) {
        Text(text = emoji, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = if (isOwn) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
}
