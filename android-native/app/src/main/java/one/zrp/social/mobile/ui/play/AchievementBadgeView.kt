package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.PlayAchievement
import one.zrp.social.mobile.ui.theme.ZrpRed

/** Ported from AchievementBadge.tsx's own ICONS map (Lucide -> closest Material equivalent). */
private fun achievementIcon(icon: String): ImageVector = when (icon) {
    "Footprints" -> Icons.Filled.DirectionsWalk
    "Rocket" -> Icons.Filled.RocketLaunch
    "Trophy" -> Icons.Filled.EmojiEvents
    "Crown" -> Icons.Filled.WorkspacePremium
    "Swords" -> Icons.Filled.MilitaryTech
    "Sword" -> Icons.Filled.Shield
    "ShieldCheck" -> Icons.Filled.VerifiedUser
    "Flame" -> Icons.Filled.LocalFireDepartment
    "Zap" -> Icons.Filled.Bolt
    "Medal" -> Icons.Filled.Stars
    else -> Icons.Filled.EmojiEvents
}

/** Ported from AchievementBadge.tsx. */
@Composable
fun AchievementBadgeView(achievement: PlayAchievement, locked: Boolean = false, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (locked) MaterialTheme.colorScheme.surfaceContainerLow else MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(if (locked) MaterialTheme.colorScheme.surfaceContainerHigh else ZrpRed),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                achievementIcon(achievement.icon),
                contentDescription = null,
                tint = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else Color.White,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            text = achievement.name,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            text = achievement.description,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 2.dp),
        )
        if (locked) {
            Text(
                text = stringResource(R.string.play_locked),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
