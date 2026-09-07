package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.PlayDuelSummary
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge

/** Ported from DuelCard.tsx. */
@Composable
fun DuelCardView(
    duel: PlayDuelSummary,
    ownUserId: String?,
    onClick: (String) -> Unit,
    onAccept: ((String) -> Unit)? = null,
    onDecline: ((String) -> Unit)? = null,
    busy: Boolean = false,
) {
    val isChallenger = ownUserId == duel.challengerId
    val opponent = if (isChallenger) duel.opponent else duel.challenger

    val iWon = duel.status == "COMPLETED" && duel.winnerId == ownUserId
    val iLost = duel.status == "COMPLETED" && duel.winnerId != null && duel.winnerId != ownUserId
    val isTie = duel.status == "COMPLETED" && duel.winnerId == null

    val canRespond = duel.status == "PENDING" && ownUserId == duel.opponentId
    val canPlay = duel.status == "ACCEPTED"

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(enabled = canPlay) { onClick(duel.id) }
            .padding(12.dp),
    ) {
        Avatar(url = opponent.avatarUrl, name = opponent.username, size = 40.dp)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "@${opponent.username}",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                VerifiedBadge(badgeType = opponent.badgeType, modifier = Modifier.padding(start = 2.dp))
            }
            Text(
                text = "${challengeTypeLabel(duel.challenge.type)} - ${duel.challenge.title}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (duel.status == "COMPLETED") {
                Text(
                    text = when {
                        iWon -> stringResource(R.string.play_you_won)
                        iLost -> stringResource(R.string.play_you_lost)
                        isTie -> stringResource(R.string.play_tied)
                        else -> ""
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (iWon) Color(0xFF15803D) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        when {
            canRespond -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onDecline?.invoke(duel.id) }, enabled = !busy) {
                        Text(stringResource(R.string.play_decline))
                    }
                    Button(onClick = { onAccept?.invoke(duel.id) }, enabled = !busy) {
                        Text(stringResource(R.string.play_accept))
                    }
                }
            }
            canPlay -> {
                Button(onClick = { onClick(duel.id) }) {
                    Text(stringResource(R.string.play_play))
                }
            }
            else -> {
                Text(
                    text = duelStatusLabel(duel.status),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}
