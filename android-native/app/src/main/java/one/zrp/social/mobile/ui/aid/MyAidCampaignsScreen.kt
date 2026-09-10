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
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.network.HelpMyCampaign
import one.zrp.social.mobile.ui.components.ZrpEmptyState

/**
 * My Campaigns - ported from MyCampaignsPage.tsx: the organizer's own
 * campaigns with raised/available-balance amounts and a withdrawal
 * request against the real POST /help/{id}/withdraw endpoint.
 */
@Composable
fun MyAidCampaignsScreen(onBack: () -> Unit, onOpenCampaign: (String) -> Unit) {
    val viewModel: MyAidCampaignsViewModel = viewModel(
        factory = remember { MyAidCampaignsViewModelFactory(AidRepository()) },
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
                text = stringResource(R.string.aid_my_campaigns),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.withdrawSuccess) {
            Text(
                text = stringResource(R.string.aid_withdrawal_requested),
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.campaigns.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    ZrpEmptyState(
                        icon = Icons.Filled.VolunteerActivism,
                        title = stringResource(R.string.aid_no_own_campaigns),
                    )
                }
            }
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.campaigns, key = { it.id }) { campaign ->
                        MyAidCampaignRow(
                            campaign = campaign,
                            isWithdrawOpen = state.withdrawTargetId == campaign.id,
                            withdrawAmount = state.withdrawAmount,
                            isWithdrawing = state.isWithdrawing,
                            withdrawError = state.withdrawError,
                            onClick = { onOpenCampaign(campaign.id) },
                            onStartWithdraw = { viewModel.onStartWithdraw(campaign.id) },
                            onCancelWithdraw = viewModel::onCancelWithdraw,
                            onWithdrawAmountChange = viewModel::onWithdrawAmountChange,
                            onConfirmWithdraw = viewModel::confirmWithdraw,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MyAidCampaignRow(
    campaign: HelpMyCampaign,
    isWithdrawOpen: Boolean,
    withdrawAmount: String,
    isWithdrawing: Boolean,
    withdrawError: String?,
    onClick: () -> Unit,
    onStartWithdraw: () -> Unit,
    onCancelWithdraw: () -> Unit,
    onWithdrawAmountChange: (String) -> Unit,
    onConfirmWithdraw: () -> Unit,
) {
    val needsMoney = campaign.needTypes.contains("MONEY")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick, role = Role.Button)
            .padding(16.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(campaignCategoryIcon(campaign.category), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    Text(
                        text = campaignCategoryLabel(campaign.category),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
                Text(
                    text = campaign.title,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Text(
                text = campaignStatusLabel(campaign.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = campaignStatusColor(campaign.status),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(campaignStatusColor(campaign.status).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        if (!campaign.rejectionReason.isNullOrBlank()) {
            Text(
                text = campaign.rejectionReason,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        if (needsMoney) {
            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.aid_raised),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = formatCampaignAmount(campaign.raisedAmount, campaign.currency),
                        fontWeight = FontWeight.Bold,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.aid_available_balance),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = formatCampaignAmount(campaign.balance, campaign.currency),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
            Text(
                text = stringResource(R.string.aid_contributions_count, campaign._count.contributions),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(R.string.aid_offers_count, campaign._count.offers),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        if (needsMoney && campaign.status == "ACTIVE" && campaign.balance > 0) {
            if (isWithdrawOpen) {
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    OutlinedTextField(
                        value = withdrawAmount,
                        onValueChange = onWithdrawAmountChange,
                        placeholder = { Text(stringResource(R.string.aid_amount_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (withdrawError != null) {
                        val errorText = when (withdrawError) {
                            MyAidCampaignsViewModel.invalidAmountError -> stringResource(R.string.aid_err_invalid_amount)
                            MyAidCampaignsViewModel.withdrawFailedError -> stringResource(R.string.aid_err_withdraw_failed)
                            else -> withdrawError
                        }
                        Text(
                            text = errorText,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Row(modifier = Modifier.padding(top = 8.dp)) {
                        Button(onClick = onConfirmWithdraw, enabled = !isWithdrawing) {
                            Text(stringResource(if (isWithdrawing) R.string.aid_requesting else R.string.aid_confirm_withdrawal))
                        }
                        OutlinedButton(onClick = onCancelWithdraw, modifier = Modifier.padding(start = 8.dp)) {
                            Text(stringResource(R.string.aid_cancel))
                        }
                    }
                }
            } else {
                Text(
                    text = stringResource(R.string.aid_request_withdrawal),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .clickable(onClick = onStartWithdraw, role = Role.Button),
                )
            }
        }
    }
}
