package one.zrp.social.mobile.ui.aid

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.network.HelpOffer
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge

/**
 * Review Offers - ported from CampaignOffersPage.tsx: the organizer's
 * own list of offers on a campaign, with the same PENDING -> Acknowledge/
 * Fulfill/Decline and ACKNOWLEDGED -> Fulfill status transitions.
 */
@Composable
fun AidOffersScreen(campaignId: String, onBack: () -> Unit, onOpenOfferer: (String) -> Unit) {
    val viewModel: AidOffersViewModel = viewModel(
        factory = remember { AidOffersViewModelFactory(campaignId, AidRepository()) },
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
                text = stringResource(R.string.aid_offers_review_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.offers.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.aid_no_offers_yet),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.offers, key = { it.id }) { offer ->
                        AidOfferRow(
                            offer = offer,
                            isBusy = state.busyOfferId == offer.id,
                            onOpenOfferer = onOpenOfferer,
                            onUpdateStatus = { status -> viewModel.updateStatus(offer.id, status) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AidOfferRow(
    offer: HelpOffer,
    isBusy: Boolean,
    onOpenOfferer: (String) -> Unit,
    onUpdateStatus: (String) -> Unit,
) {
    val offerer = offer.offerer
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(16.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .clickable(enabled = offerer != null) { offerer?.let { onOpenOfferer(it.username) } },
            ) {
                Avatar(url = offerer?.avatarUrl, name = offerer?.username ?: "?", size = 36.dp)
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "@${offerer?.username ?: ""}",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        VerifiedBadge(badgeType = offerer?.badgeType)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            helpNeedTypeIcon(offer.needType),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = helpNeedTypeLabel(offer.needType),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 2.dp),
                        )
                    }
                }
            }
            Text(
                text = helpOfferStatusLabel(offer.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Text(
            text = offer.message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp),
        )

        if (offer.status == "PENDING") {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 12.dp),
            ) {
                OutlinedButton(onClick = { onUpdateStatus("ACKNOWLEDGED") }, enabled = !isBusy) {
                    Text(stringResource(R.string.aid_offer_status_acknowledged))
                }
                Button(onClick = { onUpdateStatus("FULFILLED") }, enabled = !isBusy) {
                    Text(stringResource(R.string.aid_offer_status_fulfilled))
                }
                Button(
                    onClick = { onUpdateStatus("DECLINED") },
                    enabled = !isBusy,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) {
                    Text(stringResource(R.string.aid_offer_status_declined))
                }
            }
        } else if (offer.status == "ACKNOWLEDGED") {
            Row(modifier = Modifier.padding(top = 12.dp)) {
                Button(onClick = { onUpdateStatus("FULFILLED") }, enabled = !isBusy) {
                    Text(stringResource(R.string.aid_offer_status_fulfilled))
                }
            }
        }
    }
}
