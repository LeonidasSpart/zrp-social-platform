package one.zrp.social.mobile.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
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
 */
@Composable
fun LinkifiedText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    onMentionClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
    onNonLinkClick: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val annotated = remember(text) { buildLinkifiedString(text) }

    ClickableText(
        text = annotated,
        style = style.copy(color = if (style.color == Color.Unspecified) MaterialTheme.colorScheme.onSurface else style.color),
        modifier = modifier,
        onClick = { offset ->
            val mention = annotated.getStringAnnotations(TAG_MENTION, offset, offset).firstOrNull()
            val hashtag = annotated.getStringAnnotations(TAG_HASHTAG, offset, offset).firstOrNull()
            val url = annotated.getStringAnnotations(TAG_URL, offset, offset).firstOrNull()
            when {
                mention != null -> onMentionClick(mention.item)
                hashtag != null -> onHashtagClick(hashtag.item)
                url != null -> {
                    val href = if (url.item.startsWith("http")) url.item else "https://${url.item}"
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href)))
                }
                else -> onNonLinkClick?.invoke()
            }
        },
    )
}

private fun buildLinkifiedString(content: String): AnnotatedString {
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

            val start = length
            append(raw)
            addStyle(SpanStyle(color = ZrpRed, textDecoration = TextDecoration.Underline), start, length)
            val value = if (type == TAG_URL) raw else raw.substring(1)
            addStringAnnotation(type, value, start, length)

            if (trailing.isNotEmpty()) append(trailing)

            lastIndex = match.range.last + 1
        }
        if (lastIndex < content.length) {
            append(content.substring(lastIndex))
        }
    }.toAnnotatedString()
}
