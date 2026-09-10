package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.TriviaContent
import one.zrp.social.mobile.ui.theme.ZrpRed

/** Ported from TriviaPlayer.tsx: one question at a time, all answered before Finish is enabled. */
@Composable
fun TriviaPlayerView(content: TriviaContent, onSubmit: (answers: List<Int>, timeMs: Long) -> Unit, submitting: Boolean) {
    val total = content.questions.size
    var index by remember { mutableIntStateOf(0) }
    val answers = remember { mutableStateOf(MutableList(total) { -1 }) }
    val startedAt = remember { System.currentTimeMillis() }

    val question = content.questions[index]
    val isLast = index == total - 1
    val canAdvance = answers.value[index] != -1

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = stringResource(R.string.play_question, index + 1, total),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(question.q, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            question.options.forEachIndexed { optIndex, option ->
                val selected = answers.value[index] == optIndex
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (selected) ZrpRed.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceContainerLow)
                        .clickable(role = Role.Button) {
                            val next = answers.value.toMutableList()
                            next[index] = optIndex
                            answers.value = next
                        }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                ) {
                    Text(
                        text = option,
                        color = if (selected) ZrpRed else MaterialTheme.colorScheme.onSurface,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    )
                    if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = ZrpRed)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            if (!isLast) {
                Button(onClick = { index = (index + 1).coerceAtMost(total - 1) }, enabled = canAdvance) {
                    Text(stringResource(R.string.play_next))
                }
            } else {
                Button(
                    onClick = { onSubmit(answers.value, System.currentTimeMillis() - startedAt) },
                    enabled = canAdvance && !submitting,
                ) {
                    Text(stringResource(if (submitting) R.string.play_submitting else R.string.play_finish))
                }
            }
        }
    }
}
