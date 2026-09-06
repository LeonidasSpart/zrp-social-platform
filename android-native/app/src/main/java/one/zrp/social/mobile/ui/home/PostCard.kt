package one.zrp.social.mobile.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Translate
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.ReactionToggleRequest
import one.zrp.social.mobile.network.TranslateRequest
import one.zrp.social.mobile.ui.components.AddReactionDialog
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.LinkifiedText
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.ZrpBlue
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount
import one.zrp.social.mobile.util.formatRelativeTime
import java.util.Locale

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
    // Pin to profile - the website only offers this from the Profile
    // screen itself (showPinOption there is isOwnProfile; every other
    // surface that renders PostCard - Home, Search, Bookmarks, Quotes -
    // never passes it), so it defaults off everywhere else too.
    showPinOption: Boolean = false,
    isPinned: Boolean = false,
    onPinClick: (String) -> Unit = {},
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
                        VerifiedBadge(badgeType = post.author.badgeType, modifier = Modifier.padding(start = 3.dp))
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
                                    contentDescription = if (isPinned) "Unpin from profile" else "Pin to profile",
                                    tint = if (isPinned) ZrpBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(IconSize.sm),
                                )
                            }
                        }
                        IconButton(onClick = { onEditClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Edit,
                                contentDescription = "Edit post",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                        IconButton(onClick = { onDeleteClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.DeleteOutline,
                                contentDescription = "Delete post",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    } else {
                        IconButton(onClick = { onReportClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Flag,
                                contentDescription = "Report post",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    }
                }

                if (post.content.isNotBlank()) {
                    LinkifiedText(
                        text = post.content,
                        style = MaterialTheme.typography.bodyMedium,
                        onMentionClick = onAuthorClick,
                        onHashtagClick = onHashtagClick,
                        onNonLinkClick = { onClick(post.id) },
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }

                val previewUrl = post.imageUrl ?: post.imageUrls?.firstOrNull()
                if (previewUrl != null) {
                    AsyncImage(
                        model = previewUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm)
                            .clip(MaterialTheme.shapes.medium),
                    )
                }

                val quotedPost = post.quotePost
                if (quotedPost != null) {
                    QuotedPostPreview(
                        quotedPost = quotedPost,
                        onClick = { onClick(quotedPost.id) },
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
                        contentDescription = "Comments",
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
                                contentDescription = "Add reaction",
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

        HorizontalDivider(modifier = Modifier.padding(top = Spacing.md))
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
                    contentDescription = "Repost options",
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
                text = { Text(if (reposted) "Undo Repost" else "Repost") },
                onClick = {
                    menuOpen = false
                    onRepostToggle()
                },
            )
            DropdownMenuItem(
                text = { Text("Quote") },
                onClick = {
                    menuOpen = false
                    onQuoteClick()
                },
            )
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text("${formatCount(count)} reposts", style = MaterialTheme.typography.labelSmall) },
                onClick = {
                    menuOpen = false
                    onViewReposts()
                },
            )
            DropdownMenuItem(
                text = { Text("${formatCount(quoteCount)} quotes", style = MaterialTheme.typography.labelSmall) },
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
                modifier = Modifier.padding(start = Spacing.xs),
            )
            VerifiedBadge(badgeType = quotedPost.author.badgeType, size = 14.dp, modifier = Modifier.padding(start = 2.dp))
            Text(
                text = "@${quotedPost.author.username}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = Spacing.xs),
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
                contentDescription = if (liked) "Unlike" else "Like",
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

// No count shown, matching the website's own bookmark control (a
// plain toggle icon, never a bookmark tally next to a post).
@Composable
private fun BookmarkButton(bookmarked: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
        Icon(
            imageVector = if (bookmarked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            contentDescription = if (bookmarked) "Remove bookmark" else "Bookmark",
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
