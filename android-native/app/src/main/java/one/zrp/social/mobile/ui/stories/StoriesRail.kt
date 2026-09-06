package one.zrp.social.mobile.ui.stories

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The Home feed's stories rail - real 24-hour stories (own + everyone
 * followed), same as the website's rail. Tapping "Your story"'s avatar
 * opens the viewer if there's an active one, otherwise the composer;
 * its small "+" badge always opens the composer directly, so posting
 * another story doesn't require first navigating away from an active
 * one. Tapping anyone else's avatar always opens the viewer.
 */
@Composable
fun StoriesRail(
    onOpenViewer: (userId: String) -> Unit,
    onCreateStory: () -> Unit,
) {
    val viewModel: StoriesViewModel = viewModel(
        factory = remember { StoriesViewModelFactory(StoriesRepository()) },
    )
    val state by viewModel.state.collectAsState()

    if (state.isLoading) return

    val ownGroup = state.groups.find { it.user.id == state.ownUserId }
    val otherGroups = state.groups.filter { it.user.id != state.ownUserId }

    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            StoryTile(
                label = stringResource(R.string.stories_your_story),
                avatarUrl = ownGroup?.user?.avatarUrl,
                hasUnviewed = ownGroup?.stories?.any { story -> !story.viewed } == true,
                // Always available on your own tile, not just when you
                // have no active story - the badge is a persistent "add
                // another" affordance (matching the website's own "Your
                // Story" button, which always opens the composer),
                // separate from the avatar's own tap target below.
                onAddClick = onCreateStory,
                onClick = {
                    val ownId = state.ownUserId
                    if (ownGroup != null && ownId != null) onOpenViewer(ownId) else onCreateStory()
                },
            )
        }

        items(otherGroups, key = { it.user.id }) { group ->
            StoryTile(
                label = group.user.name ?: group.user.username,
                avatarUrl = group.user.avatarUrl,
                hasUnviewed = group.stories.any { story -> !story.viewed },
                onAddClick = null,
                onClick = { onOpenViewer(group.user.id) },
            )
        }
    }
}

@Composable
private fun StoryTile(
    label: String,
    avatarUrl: String?,
    hasUnviewed: Boolean,
    onAddClick: (() -> Unit)?,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .width(72.dp)
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(modifier = Modifier.size(64.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .border(
                        width = if (hasUnviewed) 3.dp else 1.dp,
                        color = if (hasUnviewed) ZrpRed else MaterialTheme.colorScheme.outline,
                        shape = CircleShape,
                    )
                    .padding(3.dp)
                    .clip(CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Avatar(url = avatarUrl, name = label, size = 58.dp)
            }

            if (onAddClick != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(20.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onAddClick),
                ) {
                    Icon(
                        imageVector = Icons.Filled.AddCircle,
                        contentDescription = stringResource(R.string.stories_add_story),
                        tint = ZrpRed,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }

        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
