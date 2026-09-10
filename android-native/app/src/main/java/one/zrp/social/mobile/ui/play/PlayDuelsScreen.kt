package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.SportsMartialArts
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.ui.components.ZrpEmptyState

/** My Duels - ported from PlayDuelsPage.tsx. */
@Composable
fun PlayDuelsScreen(onBack: () -> Unit, onOpenDuel: (String) -> Unit) {
    val viewModel: PlayDuelsViewModel = viewModel(
        factory = remember { PlayDuelsViewModelFactory(PlayRepository()) },
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
        Text(
            text = stringResource(R.string.play_duels_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.duels.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    ZrpEmptyState(
                        icon = Icons.Filled.SportsMartialArts,
                        title = stringResource(R.string.play_no_duels_yet),
                    )
                }
            }
            else -> {
                val incoming = state.duels.filter { it.status == "PENDING" }
                val active = state.duels.filter { it.status == "ACCEPTED" }
                val history = state.duels.filter { it.status in setOf("COMPLETED", "DECLINED", "EXPIRED") }

                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (incoming.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.play_incoming_duels),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        items(incoming, key = { it.id }) { duel ->
                            DuelCardView(
                                duel = duel,
                                ownUserId = state.ownUserId,
                                onClick = onOpenDuel,
                                onAccept = { id -> viewModel.respond(id, true) },
                                onDecline = { id -> viewModel.respond(id, false) },
                                busy = state.busyDuelId == duel.id,
                            )
                        }
                    }
                    if (active.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.play_active_duels),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        items(active, key = { it.id }) { duel ->
                            DuelCardView(duel = duel, ownUserId = state.ownUserId, onClick = onOpenDuel)
                        }
                    }
                    if (history.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.play_duel_history),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        items(history, key = { it.id }) { duel ->
                            DuelCardView(duel = duel, ownUserId = state.ownUserId, onClick = onOpenDuel)
                        }
                    }
                }
            }
        }
    }
}
