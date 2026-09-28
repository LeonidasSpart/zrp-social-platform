package one.zrp.social.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.components.LocalInAppLinkHandler
import one.zrp.social.mobile.ui.components.openLink
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The RECRUITMENT/ARTICLE type-specific block a post carries alongside
 * its plain `content` (`Post.type` in prisma/schema.prisma - see
 * PostsApi.kt's own Post.type/company/location/applyUrl/body doc
 * comment). Mirrors PostCard.tsx's own two dedicated cards; a plain
 * "POST" (or any future/unrecognized type) renders nothing here, same
 * as before this existed.
 *
 * Reused everywhere PostCard is - feed, profile, post detail, search,
 * bookmarks, community/hashtag/list feeds, quotes - since none of those
 * screens render a post any other way. Before this, a RECRUITMENT or
 * ARTICLE post from web showed on Android as bare `content` text with
 * the job details/article body silently dropped.
 */
@Composable
fun PostTypeContent(post: Post, modifier: Modifier = Modifier) {
    when (post.type) {
        "RECRUITMENT" -> {
            if (post.company != null || post.location != null || post.applyUrl != null) {
                RecruitmentCard(post = post, modifier = modifier)
            }
        }
        "ARTICLE" -> {
            if (!post.body.isNullOrBlank()) {
                ArticleBody(post = post, modifier = modifier)
            }
        }
    }
}

@Composable
private fun RecruitmentCard(post: Post, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val inAppHandler = LocalInAppLinkHandler.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.Work,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Column {
                Text(
                    text = stringResource(R.string.post_recruitment_heading),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.post_recruitment_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(Spacing.xs),
            modifier = Modifier.fillMaxWidth().padding(Spacing.md),
        ) {
            val company = post.company
            if (!company.isNullOrBlank()) {
                Text(text = company, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }

            val location = post.location
            if (!location.isNullOrBlank()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(text = location, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            val applyUrl = post.applyUrl?.trim()
            // Only real web/mail links - a stored javascript: URL
            // (accepted by the API before it validated this field, same
            // history PostCard.tsx's own comment documents) must never
            // become a clickable target.
            if (!applyUrl.isNullOrBlank() && Regex("^(https?:|mailto:)", RegexOption.IGNORE_CASE).containsMatchIn(applyUrl)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    modifier = Modifier
                        .padding(top = Spacing.xs)
                        .background(ZrpRed, MaterialTheme.shapes.extraLarge)
                        .clickable(role = Role.Button) { openLink(context, inAppHandler, applyUrl) }
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                ) {
                    Text(
                        text = stringResource(R.string.post_apply_now),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    )
                    Icon(
                        imageVector = Icons.Filled.OpenInNew,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

// Matches PostCard.tsx's own ARTICLE preview truncation length (300
// characters of plain text before "Read more").
private const val ARTICLE_PREVIEW_LENGTH = 300

@Composable
private fun ArticleBody(post: Post, modifier: Modifier = Modifier) {
    var expanded by remember(post.id) { mutableStateOf(false) }

    // The body is pre-sanitized rich-text HTML from the website's
    // article editor (same field PostCard.tsx renders via
    // dangerouslySetInnerHTML, safe there only because it's sanitized
    // server-side before storage - never re-sanitized independently
    // here). Rendering it as real formatted HTML would need a WebView/
    // HTML-to-AnnotatedString renderer this app doesn't have yet; showing
    // the plain text (tags stripped) is a deliberate, documented scope
    // reduction rather than silently dropping the article entirely, which
    // is what happened before this file existed.
    val plainText = remember(post.body) { stripHtmlTags(post.body.orEmpty()) }
    val isLong = plainText.length > ARTICLE_PREVIEW_LENGTH
    val displayed = if (isLong && !expanded) plainText.take(ARTICLE_PREVIEW_LENGTH) + "…" else plainText

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.Article,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(R.string.post_article_heading),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Column(modifier = Modifier.fillMaxWidth().padding(Spacing.md)) {
            Text(text = displayed, style = MaterialTheme.typography.bodyMedium)
            if (isLong) {
                Text(
                    text = if (expanded) "Show less" else "Show more",
                    style = MaterialTheme.typography.bodySmall,
                    color = ZrpRed,
                    modifier = Modifier
                        .padding(top = Spacing.xs)
                        .clickable(role = Role.Button) { expanded = !expanded },
                )
            }
        }
    }
}

/** Strips HTML tags and un-escapes the handful of entities the rich-text
 * editor's own output actually uses, for a readable plain-text preview.
 * Not a general-purpose HTML parser - see [ArticleBody]'s own KDoc on
 * why full rendering isn't attempted here. Internal (not private) so
 * PostTypeContentTest can exercise it directly with plain JUnit. */
internal fun stripHtmlTags(html: String): String {
    return html
        .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        // Block-level closes get a blank-line break (real paragraph
        // separation), not just a single line break like <br> - the
        // \n{3,} collapse below keeps a run of empty block tags (e.g.
        // <div></div><div></div>) from ballooning into a wall of blank
        // lines.
        .replace(Regex("</p>|</div>|</li>", RegexOption.IGNORE_CASE), "\n\n")
        .replace(Regex("<[^>]*>"), "")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()
}
