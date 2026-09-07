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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.LogicContent
import one.zrp.social.mobile.ui.theme.ZrpRed

/** Ported from LogicPlayer.tsx: multiple-choice when options exist, free text otherwise. */
@Composable
fun LogicPlayerView(
    content: LogicContent,
    onSubmit: (answerIndex: Int?, answerText: String?, timeMs: Long) -> Unit,
    submitting: Boolean,
) {
    val startedAt = remember { System.currentTimeMillis() }
    val isMultipleChoice = !content.options.isNullOrEmpty()
    var selected by remember { mutableStateOf<Int?>(null) }
    var text by remember { mutableStateOf("") }

    val canSubmit = if (isMultipleChoice) selected != null else text.isNotBlank()

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = stringResource(R.string.play_logic_instructions),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(content.prompt, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

        if (isMultipleChoice) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content.options.orEmpty().forEachIndexed { optIndex, option ->
                    val isSelected = selected == optIndex
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (isSelected) ZrpRed.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceContainerLow)
                            .clickable { selected = optIndex }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    ) {
                        Text(
                            text = option,
                            color = if (isSelected) ZrpRed else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        )
                        if (isSelected) Icon(Icons.Filled.Check, contentDescription = null, tint = ZrpRed)
                    }
                }
            }
        } else {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(stringResource(R.string.play_your_answer)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = {
                    val timeMs = System.currentTimeMillis() - startedAt
                    if (isMultipleChoice) onSubmit(selected, null, timeMs) else onSubmit(null, text.trim(), timeMs)
                },
                enabled = canSubmit && !submitting,
            ) {
                Text(stringResource(if (submitting) R.string.play_submitting else R.string.play_finish))
            }
        }
    }
}
