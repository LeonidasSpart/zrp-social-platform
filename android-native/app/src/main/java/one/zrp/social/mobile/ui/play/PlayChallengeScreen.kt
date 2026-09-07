package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayChallengeContent
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Play a challenge - ported from PlayChallengePage.tsx. Duel play and
 * the "Challenge a Friend" panel are a later native phase.
 */
@Composable
fun PlayChallengeScreen(challengeId: String, onBack: () -> Unit) {
    val viewModel: PlayChallengeViewModel = viewModel(
        factory = remember { PlayChallengeViewModelFactory(challengeId, PlayRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = stringResource(R.string.play_hero_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.challenge == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.play_err_load_failed),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                val challenge = state.challenge!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                ) {
                    val result = state.result
                    if (result == null) {
                        Text(
                            text = challengeTypeLabel(challenge.type),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZrpRed,
                        )
                        Text(
                            text = challenge.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
                        )

                        val error = state.error
                        if (error != null) {
                            val errorText = if (error == PlayChallengeViewModel.submitFailedError) {
                                stringResource(R.string.play_err_submit_failed)
                            } else {
                                error
                            }
                            Text(
                                text = errorText,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(bottom = 16.dp),
                            )
                        }

                        when (val content = state.content) {
                            is PlayChallengeContent.Trivia -> TriviaPlayerView(
                                content = content.content,
                                onSubmit = { answers, timeMs -> viewModel.submitTrivia(answers, timeMs) },
                                submitting = state.isSubmitting,
                            )
                            is PlayChallengeContent.Memory -> MemoryPlayerView(
                                content = content.content,
                                onSubmit = { moves, matchedPairs, timeMs -> viewModel.submitMemory(moves, matchedPairs, timeMs) },
                                submitting = state.isSubmitting,
                            )
                            is PlayChallengeContent.Logic -> LogicPlayerView(
                                content = content.content,
                                onSubmit = { answerIndex, answerText, timeMs -> viewModel.submitLogic(answerIndex, answerText, timeMs) },
                                submitting = state.isSubmitting,
                            )
                            null -> {}
                        }
                    } else if (result.waitingForOpponent) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 32.dp)) {
                            Text(
                                text = "${stringResource(R.string.play_your_score)}: ${result.score}/${result.maxScore}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = stringResource(R.string.play_waiting_for_opponent),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
                            Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = ZrpRed, modifier = Modifier.padding(bottom = 8.dp))
                            Text(
                                text = "${result.score}/${result.maxScore}",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.ExtraBold,
                            )

                            if (result.xpEarned != null) {
                                Text(
                                    text = buildString {
                                        append("+${result.xpEarned} ")
                                        append(stringResource(R.string.play_xp_earned))
                                        if (result.level != null) {
                                            append(" · ")
                                            append(stringResource(R.string.play_level, result.level))
                                        }
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 8.dp),
                                )
                            }

                            if (result.unlockedAchievements.isNotEmpty()) {
                                Text(
                                    text = stringResource(R.string.play_new_achievement),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(top = 24.dp, bottom = 12.dp),
                                )
                                LazyVerticalGrid(
                                    columns = GridCells.Fixed(2),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 8.dp),
                                ) {
                                    items(result.unlockedAchievements, key = { it.key }) { achievement ->
                                        AchievementBadgeView(achievement = achievement)
                                    }
                                }
                            }

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.padding(top = 24.dp),
                            ) {
                                Button(onClick = viewModel::shareResult, enabled = !state.shared && !state.isSharing) {
                                    Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.padding(end = 6.dp))
                                    Text(
                                        stringResource(
                                            if (state.shared) R.string.play_share_success else if (state.isSharing) R.string.play_sharing else R.string.play_share_result,
                                        ),
                                    )
                                }
                                OutlinedButton(onClick = onBack) {
                                    Text(stringResource(R.string.play_back_to_play))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
