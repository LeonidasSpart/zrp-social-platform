package one.zrp.social.mobile.ui.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * A single user's story viewer - real stories, real like/view state.
 * Manual tap-to-advance only (no auto-advance timer) and no video
 * playback yet (that needs an ExoPlayer integration this pass didn't
 * take on); a video story shows an honest label instead of silently
 * failing to render.
 */
@Composable
fun StoryViewerScreen(userId: String, onClose: () -> Unit) {
    val viewModel: StoryViewerViewModel = viewModel(
        factory = remember(userId) { StoryViewerViewModelFactory(StoriesRepository(), userId) },
    )
    val state by viewModel.state.collectAsState()
    var currentIndex by remember { mutableIntStateOf(0) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            }
            state.stories.isEmpty() -> {
                LaunchedEffect(Unit) { onClose() }
            }
            else -> {
                val stories = state.stories
                val index = currentIndex.coerceIn(0, stories.lastIndex)
                val story = stories[index]

                LaunchedEffect(story.id) {
                    viewModel.markViewed(story.id)
                }

                Column(modifier = Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        stories.forEachIndexed { segmentIndex, _ ->
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(3.dp)
                                    .background(
                                        if (segmentIndex <= index) Color.White else Color.White.copy(alpha = 0.3f),
                                    ),
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                    ) {
                        Row(modifier = Modifier.fillMaxSize()) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable {
                                        if (index > 0) currentIndex = index - 1
                                    },
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable {
                                        if (index < stories.lastIndex) currentIndex = index + 1 else onClose()
                                    },
                            )
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            when {
                                story.mediaUrl != null && story.mediaType == "image" -> {
                                    AsyncImage(
                                        model = story.mediaUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                                story.mediaUrl != null -> {
                                    Text(
                                        text = "Video story - not yet playable in the native app.",
                                        color = Color.White,
                                    )
                                }
                            }

                            if (!story.content.isNullOrBlank()) {
                                Text(
                                    text = story.content,
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.padding(top = 16.dp),
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onClose) {
                            Icon(Icons.Filled.Close, contentDescription = "Close", tint = Color.White)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { viewModel.toggleLike(story.id) }) {
                                Icon(
                                    imageVector = if (story.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                    contentDescription = "Like",
                                    tint = if (story.liked) ZrpRed else Color.White,
                                )
                            }
                            Text(text = story.likeCount.toString(), color = Color.White)
                        }
                    }
                }
            }
        }
    }
}
