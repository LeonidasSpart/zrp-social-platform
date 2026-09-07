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
import one.zrp.social.mobile.network.PlayAchievement

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

/**
 * Ported verbatim from src/lib/play/types.ts's own PLAY_ACHIEVEMENT_CATALOG
 * (client-safe display metadata mirroring the server-only achievements.ts,
 * kept in sync manually there since the unlock predicates live server-side
 * only). Name/description are deliberately plain English, matching the
 * source array - the real web catalog isn't translated either.
 */
val PLAY_ACHIEVEMENT_CATALOG: List<PlayAchievement> = listOf(
    PlayAchievement("first_steps", "First Steps", "Complete your first ZRP PLAY challenge.", "Footprints", 10),
    PlayAchievement("getting_started", "Getting Started", "Complete 10 challenges.", "Rocket", 25),
    PlayAchievement("challenge_champion", "Challenge Champion", "Complete 50 challenges.", "Trophy", 75),
    PlayAchievement("play_legend", "PLAY Legend", "Complete 200 challenges.", "Crown", 200),
    PlayAchievement("duel_debut", "Duel Debut", "Complete your first 1v1 duel.", "Swords", 10),
    PlayAchievement("duel_warrior", "Duel Warrior", "Win 10 duels.", "Sword", 50),
    PlayAchievement("duel_champion", "Duel Champion", "Win 50 duels.", "ShieldCheck", 150),
    PlayAchievement("on_fire", "On Fire", "Reach a 3-day play streak.", "Flame", 20),
    PlayAchievement("unstoppable", "Unstoppable", "Reach a 7-day play streak.", "Zap", 50),
    PlayAchievement("dedication", "Dedication", "Reach a 30-day play streak.", "Medal", 150),
)
