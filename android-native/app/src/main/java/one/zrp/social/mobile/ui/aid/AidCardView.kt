package one.zrp.social.mobile.ui.aid

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.HelpCampaignSummary
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Ported from src/components/help/CampaignCard.tsx - same cover image +
 * category badge, title, location, funding progress bar (when the
 * campaign needs money), need-type chips, and organizer row.
 */
@Composable
fun AidCardView(campaign: HelpCampaignSummary, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        ) {
            val coverImage = campaign.imageUrls.firstOrNull()
            if (coverImage != null) {
                AsyncImage(
                    model = coverImage,
                    contentDescription = campaign.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    campaignCategoryIcon(campaign.category),
                    contentDescription = campaign.title,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.6f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Icon(
                    campaignCategoryIcon(campaign.category),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.padding(end = 4.dp),
                )
                Text(
                    text = campaignCategoryLabel(campaign.category),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }

        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = campaign.title,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (campaign.location != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Icon(
                        Icons.Filled.LocationOn,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 2.dp),
                    )
                    Text(
                        text = campaign.location,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            val needsMoney = campaign.needTypes.contains("MONEY")
            if (needsMoney && campaign.goalAmount != null) {
                LinearProgressIndicator(
                    progress = { campaignProgress(campaign.raisedAmount, campaign.goalAmount) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    color = ZrpRed,
                )
                Text(
                    text = "${formatCampaignAmount(campaign.raisedAmount, campaign.currency)} ${stringResource(R.string.aid_raised_of)} " +
                        formatCampaignAmount(campaign.goalAmount, campaign.currency),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            if (campaign.needTypes.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    items(campaign.needTypes, key = { it }) { need ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        ) {
                            Icon(
                                helpNeedTypeIcon(need),
                                contentDescription = null,
                                modifier = Modifier.padding(end = 4.dp),
                            )
                            Text(text = helpNeedTypeLabel(need), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            if (campaign.organizer != null) {
                Text(
                    text = "@${campaign.organizer.username}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}
