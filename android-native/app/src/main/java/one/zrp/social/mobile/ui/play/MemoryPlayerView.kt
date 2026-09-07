package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MemoryContent
import one.zrp.social.mobile.ui.theme.ZrpRed

private data class MemoryCard(val id: Int, val value: String, val pairKey: Int)

private fun buildDeck(pairs: List<String>): List<MemoryCard> {
    val deck = pairs.mapIndexed { pairKey, value -> listOf(MemoryCard(pairKey * 2, value, pairKey), MemoryCard(pairKey * 2 + 1, value, pairKey)) }
        .flatten()
        .toMutableList()
    deck.shuffle()
    return deck
}

/** Ported from MemoryPlayer.tsx: flip two cards, auto-submit once every pair is matched. */
@Composable
fun MemoryPlayerView(content: MemoryContent, onSubmit: (moves: Int, matchedPairs: Int, timeMs: Long) -> Unit, submitting: Boolean) {
    val deck = remember { buildDeck(content.pairs) }
    val startedAt = remember { System.currentTimeMillis() }
    val totalPairs = content.pairs.size

    var flipped by remember { mutableStateOf(emptyList<Int>()) }
    var matched by remember { mutableStateOf(emptySet<Int>()) }
    var moves by remember { mutableIntStateOf(0) }
    var submitted by remember { mutableStateOf(false) }

    LaunchedEffect(flipped) {
        if (flipped.size != 2) return@LaunchedEffect
        val (a, b) = flipped
        moves += 1
        delay(700)
        if (deck[a].pairKey == deck[b].pairKey) {
            matched = matched + deck[a].pairKey
        }
        flipped = emptyList()
    }

    LaunchedEffect(matched) {
        if (matched.size == totalPairs && !submitted) {
            submitted = true
            onSubmit(moves, matched.size, System.currentTimeMillis() - startedAt)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.play_moves, moves), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.play_matched, matched.size, totalPairs), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(deck.withIndex().toList(), key = { it.value.id }) { (cardIndex, card) ->
                val isFlipped = flipped.contains(cardIndex) || matched.contains(card.pairKey)
                val isMatched = matched.contains(card.pairKey)
                Column(
                    modifier = Modifier
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            when {
                                isMatched -> Color(0xFF15803D).copy(alpha = 0.1f)
                                isFlipped -> ZrpRed.copy(alpha = 0.1f)
                                else -> MaterialTheme.colorScheme.surfaceContainerHigh
                            },
                        )
                        .clickable(enabled = !submitting && flipped.size != 2 && !flipped.contains(cardIndex) && !isMatched) {
                            flipped = flipped + cardIndex
                        }
                        .fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = if (isFlipped) card.value else "?",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            isMatched -> Color(0xFF15803D)
                            isFlipped -> ZrpRed
                            else -> Color.Transparent
                        },
                    )
                }
            }
        }
        if (submitting) {
            Text(
                text = stringResource(R.string.play_submitting),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
