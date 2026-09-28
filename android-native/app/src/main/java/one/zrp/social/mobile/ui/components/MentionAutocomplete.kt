package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * Where PostComposer.tsx's own MentionAutocomplete.tsx detects an
 * in-progress "@partial" mention: the same `/@(\w*)$/` match against
 * everything up to the cursor - so "hey @al|ice" (cursor at `|`)
 * queries "al", but "hey @alice |" (a finished, space-terminated
 * mention) returns null the moment the cursor moves past it, same as
 * web. Returns the partial username (without the leading @), or null
 * when the cursor isn't inside a mention token at all.
 */
internal fun findMentionQuery(text: String, cursor: Int): String? {
    val before = text.substring(0, cursor.coerceIn(0, text.length))
    val match = Regex("@(\\w*)$").find(before) ?: return null
    return match.groupValues[1]
}

/**
 * PostComposer.tsx's own handleMentionSelect: replaces the "@partial"
 * token immediately before the cursor with the full "@username "
 * (trailing space, plain text - no rich mention chip/markup, matching
 * how the server later re-extracts mentions with a plain
 * `/@([a-zA-Z0-9_]+)/g` regex over whatever text ends up saved), then
 * places the cursor right after the inserted text. Text after the
 * cursor (e.g. a reply typed then edited earlier in the line) is left
 * untouched. Falls back to a same, unmodified return if the cursor
 * turns out not to be inside a mention token after all (defensive:
 * this should only ever be called right after [findMentionQuery]
 * returned non-null for the same text/cursor).
 */
internal fun applyMentionSelection(text: String, cursor: Int, username: String): Pair<String, Int> {
    val clampedCursor = cursor.coerceIn(0, text.length)
    val before = text.substring(0, clampedCursor)
    val after = text.substring(clampedCursor)
    val match = Regex("@(\\w*)$").find(before) ?: return text to cursor
    val newBefore = before.substring(0, match.range.first) + "@$username "
    return (newBefore + after) to newBefore.length
}

/**
 * The mobile equivalent of MentionAutocomplete.tsx's dropdown: shown
 * directly above the composer (rather than an absolutely-positioned
 * overlay, which BasicTextField gives no caret-coordinate API to
 * anchor to) as a horizontally scrollable strip of real GET /search
 * (type=users) results - reusing the exact same endpoint and
 * already-blocked/muted-exclusion the group-chat participant picker
 * uses (see SearchRepository.searchUsers's own KDoc).
 */
@Composable
fun MentionSuggestionsRow(suggestions: List<SearchUser>, onSelect: (SearchUser) -> Unit) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(Radius.lg))
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        contentPadding = PaddingValues(horizontal = Spacing.sm),
    ) {
        items(suggestions, key = { it.id }) { user ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(Radius.lg))
                    .clickable { onSelect(user) }
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            ) {
                Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 28.dp)
                Text(
                    text = "@${user.username}",
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}
