package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.ZrpRed

/** A single duel - ported from PlayDuelDetailPage.tsx. */
@Composable
fun PlayDuelDetailScreen(duelId: String, onBack: () -> Unit, onPlay: (challengeId: String, duelId: String) -> Unit) {
    val viewModel: PlayDuelDetailViewModel = viewModel(
        factory = remember { PlayDuelDetailViewModelFactory(duelId, PlayRepository()) },
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
                text = stringResource(R.string.play_duels_title),
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
            state.notFound || state.duel == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.play_err_load_failed),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                val duel = state.duel!!
                val myId = state.ownUserId
                val isChallenger = myId == duel.challengerId
                val me = if (isChallenger) duel.challenger else duel.opponent
                val opponent = if (isChallenger) duel.opponent else duel.challenger
                val myScore = if (isChallenger) duel.challengerScore else duel.opponentScore
                val opponentScore = if (isChallenger) duel.opponentScore else duel.challengerScore
                val iHavePlayed = myScore != null

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerLow)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = challengeTypeLabel(duel.challenge.type),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZrpRed,
                    )
                    Text(
                        text = duel.challenge.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
                    )

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DuelParticipantColumn(
                            avatarUrl = me.avatarUrl,
                            username = me.username,
                            badgeType = me.badgeType,
                            score = if (duel.status == "COMPLETED") myScore else null,
                        )
                        Text(
                            text = stringResource(R.string.play_vs),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 24.dp),
                        )
                        DuelParticipantColumn(
                            avatarUrl = opponent.avatarUrl,
                            username = opponent.username,
                            badgeType = opponent.badgeType,
                            score = if (duel.status == "COMPLETED") opponentScore else null,
                        )
                    }

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(top = 24.dp),
                    ) {
                        when {
                            duel.status == "COMPLETED" -> {
                                Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = ZrpRed)
                                Text(
                                    text = when {
                                        duel.winnerId == null -> stringResource(R.string.play_tied)
                                        duel.winnerId == myId -> stringResource(R.string.play_you_won)
                                        else -> stringResource(R.string.play_you_lost)
                                    },
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                            duel.status == "ACCEPTED" && !iHavePlayed -> {
                                Button(onClick = { onPlay(duel.challenge.id, duel.id) }) {
                                    Text(stringResource(R.string.play_play))
                                }
                            }
                            duel.status == "ACCEPTED" && iHavePlayed -> {
                                Text(
                                    text = stringResource(R.string.play_waiting_for_opponent),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            else -> {
                                Text(
                                    text = duelStatusLabel(duel.status),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DuelParticipantColumn(avatarUrl: String?, username: String, badgeType: String?, score: Int?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Avatar(url = avatarUrl, name = username, size = 56.dp)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
            Text(text = "@$username", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            VerifiedBadge(badgeType = badgeType, modifier = Modifier.padding(start = 2.dp))
        }
        if (score != null) {
            Text(
                text = score.toString(),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
