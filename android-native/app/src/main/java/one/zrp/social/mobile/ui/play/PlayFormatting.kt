package one.zrp.social.mobile.ui.play

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.PLAY_CHALLENGE_TYPES

/** Ported from src/lib/play/types.ts's own TYPE_LABEL_KEYS / ChallengeCard.tsx's TYPE_ICON. */
fun challengeTypeIcon(type: String): ImageVector = when (type) {
    "TRIVIA" -> Icons.Filled.Psychology
    "MEMORY" -> Icons.Filled.GridView
    else -> Icons.Filled.Extension
}

@Composable
fun challengeTypeLabel(type: String): String = when (type) {
    "TRIVIA" -> stringResource(R.string.play_type_trivia)
    "MEMORY" -> stringResource(R.string.play_type_memory)
    else -> stringResource(R.string.play_type_logic)
}

val allChallengeTypes: List<String> get() = PLAY_CHALLENGE_TYPES

/** Ported from src/lib/play/types.ts's own DIFFICULTY_LABEL_KEYS. */
@Composable
fun difficultyLabel(difficulty: String): String = when (difficulty) {
    "easy" -> stringResource(R.string.play_difficulty_easy)
    "hard" -> stringResource(R.string.play_difficulty_hard)
    else -> stringResource(R.string.play_difficulty_medium)
}

/** Ported from src/lib/play/types.ts's own DUEL_STATUS_LABEL_KEYS. */
@Composable
fun duelStatusLabel(status: String): String = when (status) {
    "PENDING" -> stringResource(R.string.play_pending)
    "ACCEPTED" -> stringResource(R.string.play_accepted)
    "DECLINED" -> stringResource(R.string.play_declined)
    "COMPLETED" -> stringResource(R.string.play_completed)
    "EXPIRED" -> stringResource(R.string.play_expired)
    else -> status
}
