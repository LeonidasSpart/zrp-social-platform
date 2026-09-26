package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import one.zrp.social.mobile.ui.theme.ZrpRed

private val CONTENT_REGEX = Regex("""(@\w+)|(#\w+)|(https?://\S+)|(www\.\S+)""")
private val TRAILING_PUNCTUATION = Regex("""[.,!?;:'")\]}]+$""")

private const val TAG_MENTION = "mention"
private const val TAG_HASHTAG = "hashtag"
private const val TAG_URL = "url"

/**
 * Renders post/comment content with the same @mention, #hashtag, and
 * URL linkification the website's own PostCard.tsx/Comments.tsx apply
 * (identical regex, identical trailing-punctuation trimming so a
 * sentence-ending period doesn't get swallowed into a link) - content
 * was previously shown as dead plain text natively, unlike every one
 * of those surfaces on web.
 *
 * Tapping a link fires the matching callback; tapping anywhere else in
 * the text (the common case - most content has no links at all) calls
 * [onNonLinkClick], so call sites that relied on the whole card being
 * tappable (PostCard's tap-to-open-comments) keep working unchanged.
 *
 * [suppressUrl], when set, hides the one URL token whose normalized
 * href matches it - PostCard passes the link it has a preview card
 * showing for, matching PostCard.tsx's own suppression of a URL's raw
 * text once LinkPreviewCard confirms it found something for that exact
 * link, so the same URL isn't shown twice in one post.
 *
 * [linkColor] overrides the token color (default [ZrpRed]) - needed on
 * a surface that itself renders on a red background (an own-message
 * chat bubble), where ZrpRed-on-ZrpRed would be unreadable.
 *
 * [onLongClick], when set, is the text's own long-press action. This
 * is rendered as a plain Text with its own tap detector rather than
 * foundation's ClickableText: ClickableText consumes the pointer-down
 * of every press on the words, so a parent bubble's
 * combinedClickable(onLongClick = ...) never saw a long-press that
 * started on the text itself - which is most of a message bubble -
 * and the Reply / Copy / React / Edit / Delete menu only opened from
 * the bubble's padding or timestamp. Callers route [onLongClick] to
 * that same menu so long-pressing the words does what users expect.
 */
@Composable
fun LinkifiedText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    onMentionClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
    onNonLinkClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    suppressUrl: String? = null,
    linkColor: Color = ZrpRed,
) {
    val context = LocalContext.current
    val inAppLinkHandler = LocalInAppLinkHandler.current
    val annotated = remember(text, suppressUrl, linkColor) { buildLinkifiedString(text, suppressUrl, linkColor) }
    var layoutResult by remember { mutableStateOf<TextLayoutResult?>(null) }

    Text(
        text = annotated,
        style = style.copy(color = if (style.color == Color.Unspecified) MaterialTheme.colorScheme.onSurface else style.color),
        onTextLayout = { layoutResult = it },
        modifier = modifier.pointerInput(annotated, onLongClick, onNonLinkClick, onMentionClick, onHashtagClick) {
            detectTapGestures(
                onLongPress = onLongClick?.let { longClick -> { _: Offset -> longClick() } },
                onTap = { position ->
                    val offset = layoutResult?.getOffsetForPosition(position) ?: return@detectTapGestures
                    val mention = annotated.getStringAnnotations(TAG_MENTION, offset, offset).firstOrNull()
                    val hashtag = annotated.getStringAnnotations(TAG_HASHTAG, offset, offset).firstOrNull()
                    val url = annotated.getStringAnnotations(TAG_URL, offset, offset).firstOrNull()
                    when {
                        mention != null -> onMentionClick(mention.item)
                        hashtag != null -> onHashtagClick(hashtag.item)
                        url != null -> {
                            val href = if (url.item.startsWith("http")) url.item else "https://${url.item}"
                            // A zrp.one post/profile/hashtag link opens in-app
                            // (see LocalInAppLinkHandler); anything else opens
                            // the browser exactly as before.
                            openLink(context, inAppLinkHandler, href)
                        }
                        else -> onNonLinkClick?.invoke()
                    }
                },
            )
        },
    )
}

private fun buildLinkifiedString(content: String, suppressUrl: String? = null, linkColor: Color = ZrpRed): AnnotatedString {
    return AnnotatedString.Builder(content.length).apply {
        var lastIndex = 0
        for (match in CONTENT_REGEX.findAll(content)) {
            if (match.range.first > lastIndex) {
                append(content.substring(lastIndex, match.range.first))
            }

            var raw = match.value
            val type = when {
                raw.startsWith("@") -> TAG_MENTION
                raw.startsWith("#") -> TAG_HASHTAG
                else -> TAG_URL
            }

            var trailing = ""
            if (type == TAG_URL) {
                val trailingMatch = TRAILING_PUNCTUATION.find(raw)
                if (trailingMatch != null) {
                    val trimmed = raw.substring(0, raw.length - trailingMatch.value.length)
                    if (trimmed.isNotEmpty()) {
                        trailing = trailingMatch.value
                        raw = trimmed
                    }
                }
            }

            // Matches PostCard.tsx's own href-vs-previewUrl comparison
            // before it suppresses a URL token - the raw sentence
            // punctuation trimmed into `trailing` above is real text the
            // user typed, not part of the link, so it still renders even
            // when the link itself is hidden behind its own preview card.
            val href = if (type == TAG_URL && raw.startsWith("http")) raw else "https://$raw"
            val isSuppressed = type == TAG_URL && suppressUrl != null && href == suppressUrl

            if (!isSuppressed) {
                val start = length
                append(raw)
                addStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline), start, length)
                val value = if (type == TAG_URL) raw else raw.substring(1)
                addStringAnnotation(type, value, start, length)
            }

            if (trailing.isNotEmpty()) append(trailing)

            lastIndex = match.range.last + 1
        }
        if (lastIndex < content.length) {
            append(content.substring(lastIndex))
        }
    }.toAnnotatedString()
}
