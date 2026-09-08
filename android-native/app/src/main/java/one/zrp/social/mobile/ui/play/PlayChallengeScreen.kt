package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SportsMartialArts
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayChallengeContent
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Play a challenge - ported from PlayChallengePage.tsx. When duelId is
 * set, the score is submitted against that duel instead of solo play;
 * otherwise a signed-in player can challenge a friend to the same
 * challenge via the panel below the title, exactly matching web's own
 * `!duelId && session?.user` condition.
 */
@Composable
fun PlayChallengeScreen(
    challengeId: String,
    duelId: String? = null,
    onBack: () -> Unit,
    onViewDuels: () -> Unit = {},
) {
    val viewModel: PlayChallengeViewModel = viewModel(
        factory = remember { PlayChallengeViewModelFactory(challengeId, duelId, PlayRepository()) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
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

                        if (!viewModel.isDuelPlay && state.ownUserId != null) {
                            Column(modifier = Modifier.padding(bottom = 20.dp)) {
                                if (!state.showDuelPanel) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.clickable(onClick = viewModel::onOpenDuelPanel),
                                    ) {
                                        Icon(Icons.Filled.SportsMartialArts, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = stringResource(R.string.play_challenge_friend),
                                            color = ZrpRed,
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.labelLarge,
                                            modifier = Modifier.padding(start = 6.dp),
                                        )
                                    }
                                } else if (state.duelSent) {
                                    Text(
                                        text = stringResource(R.string.play_duel_sent),
                                        color = Color(0xFF15803D),
                                    )
                                } else {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(MaterialTheme.colorScheme.surfaceContainerLow)
                                            .padding(12.dp),
                                    ) {
                                        Text(
                                            text = stringResource(R.string.play_select_opponent),
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(bottom = 8.dp),
                                        )
                                        OpponentSearchView(
                                            repository = remember { PlayRepository() },
                                            value = state.opponent,
                                            onChange = viewModel::onOpponentChange,
                                            excludeUserId = state.ownUserId,
                                        )
                                        Button(
                                            onClick = viewModel::sendDuel,
                                            enabled = state.opponent != null && !state.sendingDuel,
                                            modifier = Modifier.padding(top = 12.dp),
                                        ) {
                                            Text(stringResource(if (state.sendingDuel) R.string.play_sending_challenge else R.string.play_send_challenge))
                                        }
                                    }
                                }
                            }
                        }

                        val error = state.error
                        if (error != null) {
                            val errorText = when (error) {
                                PlayChallengeViewModel.submitFailedError -> stringResource(R.string.play_err_submit_failed)
                                PlayChallengeViewModel.duelCreateFailedError -> stringResource(R.string.play_err_duel_create_failed)
                                PlayChallengeViewModel.shareFailedError -> stringResource(R.string.play_err_share_failed)
                                else -> error
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
                            Text(
                                text = stringResource(R.string.play_view_duels),
                                color = ZrpRed,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .padding(top = 16.dp)
                                    .clickable(onClick = onViewDuels),
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

                            if (result.duelCompleted) {
                                Text(
                                    text = when {
                                        result.winnerId == null -> stringResource(R.string.play_duel_result_tie)
                                        result.winnerId == state.ownUserId -> stringResource(R.string.play_duel_result_win)
                                        else -> stringResource(R.string.play_duel_result_loss)
                                    },
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(top = 8.dp),
                                )
                            }

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
                                // A real (non-lazy) grid, not
                                // LazyVerticalGrid: this whole screen
                                // already lives inside a verticalScroll
                                // Column above, and any Lazy* layout
                                // nested in a verticalScroll container
                                // gets measured with an unbounded max
                                // height, which Compose deterministically
                                // crashes on ("measured with an infinity
                                // maximum height constraint") - the exact
                                // same bug class MemoryPlayerView's own
                                // card grid hit. unlockedAchievements is
                                // always a short, bounded list per
                                // challenge, so there's no virtualization
                                // benefit being given up here.
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    result.unlockedAchievements.chunked(2).forEach { rowAchievements ->
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            rowAchievements.forEach { achievement ->
                                                Box(modifier = Modifier.weight(1f)) {
                                                    AchievementBadgeView(achievement = achievement)
                                                }
                                            }
                                            if (rowAchievements.size < 2) {
                                                Spacer(modifier = Modifier.weight(1f))
                                            }
                                        }
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
