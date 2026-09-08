package one.zrp.social.mobile.ui.aid

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * A single Aid campaign - ported from CampaignDetailPage.tsx: cover
 * image, category badge, funding progress, need-type chips,
 * description, proof links, organizer card, and report/offer actions.
 * Deliberately omits two things web shows here: the "Contribute"
 * (money) button - see AidRepository's own note - and the owner-only
 * "Review Offers" link, since that screen is a later native phase.
 */
@Composable
fun AidDetailScreen(
    campaignId: String,
    onBack: () -> Unit,
    onOpenOrganizer: (String) -> Unit,
    onOpenOffers: () -> Unit,
) {
    val viewModel: AidDetailViewModel = viewModel(
        factory = remember { AidDetailViewModelFactory(campaignId, AidRepository()) },
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
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.campaign == null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.aid_err_load_failed),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = onBack, modifier = Modifier.padding(top = Spacing.md)) {
                        Text(stringResource(R.string.aid_back_to_aid))
                    }
                }
            }
            else -> {
                val campaign = state.campaign!!
                val isOwner = state.ownUserId == campaign.organizerId
                val needsMoney = campaign.needTypes.contains("MONEY")
                val offerableNeeds = allHelpNeedTypes.filter { it != "MONEY" && campaign.needTypes.contains(it) }

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = Spacing.lg),
                ) {
                    val coverImage = campaign.imageUrls.firstOrNull()
                    if (coverImage != null) {
                        AsyncImage(
                            model = coverImage,
                            contentDescription = campaign.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(16f / 9f)
                                .clip(RoundedCornerShape(16.dp)),
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Spacing.md)) {
                        Icon(campaignCategoryIcon(campaign.category), contentDescription = null, tint = ZrpRed, modifier = Modifier.size(16.dp))
                        Text(
                            text = campaignCategoryLabel(campaign.category),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = ZrpRed,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                    Text(
                        text = campaign.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                    if (campaign.location != null) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Spacing.xs)) {
                            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(
                                text = campaign.location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 2.dp),
                            )
                        }
                    }

                    if (needsMoney && campaign.goalAmount != null) {
                        LinearProgressIndicator(
                            progress = { campaignProgress(campaign.raisedAmount, campaign.goalAmount) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = Spacing.md),
                            color = ZrpRed,
                        )
                        Text(
                            text = buildString {
                                append(formatCampaignAmount(campaign.raisedAmount, campaign.currency))
                                append(" ")
                                append(stringResource(R.string.aid_raised_of))
                                append(" ")
                                append(formatCampaignAmount(campaign.goalAmount, campaign.currency))
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }

                    if (campaign.needTypes.isNotEmpty()) {
                        Row(modifier = Modifier.padding(top = Spacing.md)) {
                            campaign.needTypes.forEach { need ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .padding(end = 6.dp)
                                        .clip(RoundedCornerShape(50))
                                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                        .padding(horizontal = 10.dp, vertical = 4.dp),
                                ) {
                                    Icon(helpNeedTypeIcon(need), contentDescription = null, modifier = Modifier.size(14.dp))
                                    Text(
                                        text = helpNeedTypeLabel(need),
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(start = 4.dp),
                                    )
                                }
                            }
                        }
                    }

                    Text(
                        text = campaign.description,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = Spacing.lg),
                    )

                    if (campaign.proofUrls.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.aid_proof_label),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
                        )
                        campaign.proofUrls.forEach { url ->
                            Text(
                                text = url,
                                style = MaterialTheme.typography.labelSmall,
                                color = ZrpRed,
                                maxLines = 1,
                            )
                        }
                    }

                    if (campaign.organizer != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .padding(top = Spacing.lg)
                                .clickable { onOpenOrganizer(campaign.organizer.username) },
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                            ) {
                                if (campaign.organizer.avatarUrl != null) {
                                    AsyncImage(
                                        model = campaign.organizer.avatarUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(
                                        Icons.Filled.Person,
                                        contentDescription = null,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(6.dp),
                                    )
                                }
                            }
                            Text(
                                text = "@${campaign.organizer.username}",
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = Spacing.xs),
                            )
                            if (campaign.organizer.badgeType != null) {
                                VerifiedBadge(badgeType = campaign.organizer.badgeType)
                            }
                        }
                    }

                    if (isOwner) {
                        Button(
                            onClick = onOpenOffers,
                            modifier = Modifier.padding(top = Spacing.lg),
                        ) {
                            Icon(Icons.Filled.Inbox, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text(
                                text = stringResource(R.string.aid_review_offers),
                                modifier = Modifier.padding(start = 6.dp),
                            )
                        }
                    } else {
                        if (offerableNeeds.isNotEmpty() && !state.offerSent) {
                            Column(
                                modifier = Modifier
                                    .padding(top = Spacing.lg)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                                    .padding(Spacing.md),
                            ) {
                                Text(
                                    text = stringResource(R.string.aid_offer_help_title),
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Row(modifier = Modifier.padding(top = Spacing.sm)) {
                                    offerableNeeds.forEach { need ->
                                        val selected = state.offerType == need
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .padding(end = 6.dp)
                                                .clip(RoundedCornerShape(50))
                                                .background(
                                                    if (selected) ZrpRed.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceContainerHigh,
                                                )
                                                .clickable { viewModel.onSelectOfferType(need) }
                                                .padding(horizontal = 10.dp, vertical = 6.dp),
                                        ) {
                                            Icon(
                                                helpNeedTypeIcon(need),
                                                contentDescription = null,
                                                tint = if (selected) ZrpRed else MaterialTheme.colorScheme.onSurface,
                                                modifier = Modifier.size(14.dp),
                                            )
                                            Text(
                                                text = helpNeedTypeLabel(need),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = if (selected) ZrpRed else MaterialTheme.colorScheme.onSurface,
                                                modifier = Modifier.padding(start = 4.dp),
                                            )
                                        }
                                    }
                                }
                                if (state.offerType != null) {
                                    OutlinedTextField(
                                        value = state.offerMessage,
                                        onValueChange = viewModel::onOfferMessageChange,
                                        placeholder = { Text(stringResource(R.string.aid_offer_message_placeholder)) },
                                        minLines = 3,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(top = Spacing.sm),
                                    )
                                    val offerError = state.offerError
                                    if (offerError != null) {
                                        val errorText = if (offerError == AidDetailViewModel.offerFailedError) {
                                            stringResource(R.string.aid_err_offer_failed)
                                        } else {
                                            offerError
                                        }
                                        Text(
                                            text = errorText,
                                            color = MaterialTheme.colorScheme.error,
                                            style = MaterialTheme.typography.labelSmall,
                                            modifier = Modifier.padding(top = Spacing.xs),
                                        )
                                    }
                                    Button(
                                        onClick = viewModel::submitOffer,
                                        enabled = !state.isSubmittingOffer && state.offerMessage.isNotBlank(),
                                        modifier = Modifier.padding(top = Spacing.sm),
                                    ) {
                                        Text(stringResource(if (state.isSubmittingOffer) R.string.aid_sending_offer else R.string.aid_send_offer))
                                    }
                                }
                            }
                        }
                        if (state.offerSent) {
                            Text(
                                text = stringResource(R.string.aid_offer_sent),
                                color = Color(0xFF15803D),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = Spacing.lg),
                            )
                        }
                    }

                    if (!isOwner) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.xl),
                        ) {
                            if (state.reportSent) {
                                Text(
                                    text = stringResource(R.string.aid_report_submitted),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable(onClick = viewModel::onOpenReport),
                                ) {
                                    Icon(Icons.Filled.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                                    Text(
                                        text = stringResource(R.string.aid_report_campaign),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(start = 4.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (state.isReportOpen) {
        ReportDialog(
            isSubmitting = state.isReportSubmitting,
            error = state.reportError,
            onDismiss = viewModel::onCancelReport,
            onSubmit = { reason, details -> viewModel.submitReport(reason, details) },
        )
    }
}
