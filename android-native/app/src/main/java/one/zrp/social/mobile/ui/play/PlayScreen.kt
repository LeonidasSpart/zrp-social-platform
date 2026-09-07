package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.SportsMartialArts
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
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP PLAY home - ported from PlayHomePage.tsx: hero, own XP bar (when
 * signed in and a profile already exists), incoming duel invites,
 * today's daily challenge, active duels, a trending-challenges grid,
 * and a leaderboard snippet. Web has no Achievements entry point on
 * this page either (the /play/achievements page itself is real but
 * unlinked from any web nav); the top-bar icon here is a reasonable
 * native affordance to that same real, functional page. Create
 * Challenge mirrors web's own session-gated hero pill.
 */
@Composable
fun PlayScreen(
    onBack: () -> Unit,
    onChallengeClick: (String) -> Unit,
    onOpenDuel: (String) -> Unit,
    onOpenDuels: () -> Unit,
    onOpenLeaderboard: () -> Unit,
    onOpenAchievements: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenCreateChallenge: () -> Unit,
) {
    val viewModel: PlayViewModel = viewModel(
        factory = remember { PlayViewModelFactory(PlayRepository()) },
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
            Spacer(modifier = Modifier.weight(1f))
            if (state.isSignedIn) {
                IconButton(onClick = onOpenCreateChallenge) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.play_create_challenge))
                }
            }
            IconButton(onClick = onOpenAchievements) {
                Icon(Icons.Filled.MilitaryTech, contentDescription = stringResource(R.string.play_achievements))
            }
            IconButton(onClick = onOpenLeaderboard) {
                Icon(Icons.Filled.EmojiEvents, contentDescription = stringResource(R.string.play_leaderboard))
            }
            IconButton(onClick = onOpenDuels) {
                Icon(Icons.Filled.SportsMartialArts, contentDescription = stringResource(R.string.play_my_duels))
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Column
        }

        Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(ZrpRed.copy(alpha = 0.08f))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.SportsEsports, contentDescription = null, tint = ZrpRed)
                    Text(
                        text = stringResource(R.string.play_hero_title),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                Text(
                    text = stringResource(R.string.play_hero_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )

                val profile = state.myProfile
                if (state.isSignedIn && profile != null) {
                    PlayXpBarView(
                        level = profile.level,
                        progressRatio = profile.progressRatio,
                        xpIntoLevel = profile.xpIntoLevel,
                        xpForLevel = profile.xpForLevel,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }

            if (state.pendingDuels.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.play_incoming_duels),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 24.dp, bottom = 12.dp),
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.pendingDuels.forEach { duel ->
                        DuelCardView(
                            duel = duel,
                            ownUserId = state.ownUserId,
                            onClick = onOpenDuel,
                            onAccept = { id -> viewModel.respondToDuel(id, true) },
                            onDecline = { id -> viewModel.respondToDuel(id, false) },
                            busy = state.busyDuelId == duel.id,
                        )
                    }
                }
            }

            Text(
                text = stringResource(R.string.play_todays_challenge),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 24.dp, bottom = 12.dp),
            )
            val daily = state.dailyChallenge
            if (daily != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(ZrpRed.copy(alpha = 0.06f))
                        .padding(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = ZrpRed, modifier = Modifier.padding(end = 4.dp))
                        Text(
                            text = challengeTypeLabel(daily.type),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZrpRed,
                        )
                    }
                    Text(
                        text = daily.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (!daily.description.isNullOrBlank()) {
                        Text(
                            text = daily.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Button(
                        onClick = { onChallengeClick(daily.id) },
                        modifier = Modifier.padding(top = 12.dp),
                    ) {
                        Text(stringResource(if (daily.alreadyPlayed) R.string.play_played else R.string.play_play_now))
                    }
                }
            } else {
                Text(
                    text = stringResource(R.string.play_no_daily_challenge),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 16.dp),
                )
            }

            if (state.activeDuels.isNotEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 24.dp, bottom = 12.dp),
                ) {
                    Text(
                        text = stringResource(R.string.play_active_duels),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(R.string.play_view_duels),
                        color = ZrpRed,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clickable(onClick = onOpenDuels),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.activeDuels.take(3).forEach { duel ->
                        DuelCardView(duel = duel, ownUserId = state.ownUserId, onClick = onOpenDuel)
                    }
                }
            }

            Text(
                text = stringResource(R.string.play_trending),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 24.dp, bottom = 12.dp),
            )
            if (state.trending.isEmpty()) {
                Text(
                    text = stringResource(R.string.play_no_trending_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp),
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 24.dp),
                ) {
                    items(state.trending, key = { it.id }) { challenge ->
                        ChallengeCardView(challenge = challenge, onClick = { onChallengeClick(challenge.id) })
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 12.dp),
            ) {
                Text(
                    text = stringResource(R.string.play_leaderboard),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(R.string.play_view_leaderboard),
                    color = ZrpRed,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.clickable(onClick = onOpenLeaderboard),
                )
            }
            if (state.topLeaderboard.isEmpty()) {
                Text(
                    text = stringResource(R.string.play_no_leaderboard_data),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp),
                )
            } else {
                Column(modifier = Modifier.padding(bottom = 24.dp)) {
                    LeaderboardTableView(
                        entries = state.topLeaderboard,
                        ownUserId = state.ownUserId,
                        onEntryClick = onOpenProfile,
                    )
                }
            }
        }
    }
}
