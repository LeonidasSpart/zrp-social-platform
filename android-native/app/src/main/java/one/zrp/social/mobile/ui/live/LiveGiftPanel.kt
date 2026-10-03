package one.zrp.social.mobile.ui.live

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveApiException
import one.zrp.social.mobile.network.LiveGift
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed

private val QUICK_QUANTITIES = listOf(1, 5, 10, 50)

/**
 * The gift panel: real catalog (GET /live/gifts), real balance
 * (GET /wallet/coins/balance), a quantity picker, and a send that only
 * reports success after the server confirms the debit
 * ([LiveGiftState.confirmedSendCount] bumps). Coins can't be bought
 * here - the purchase route rejects the native app (store-sensitive
 * payment, same policy that keeps Tips web-only) - so the panel says
 * where to top up instead of hiding the balance.
 *
 * [onConfirmedSend] fires once per server-confirmed send while open; the
 * caller closes the sheet and shows its own confirmation. The animation
 * every viewer sees comes separately from the `live-gift:sent` broadcast.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveGiftPanel(
    state: LiveGiftState,
    hostName: String,
    onRetryCatalog: () -> Unit,
    onRetryBalance: () -> Unit,
    onSend: (giftKey: String, quantity: Int) -> Unit,
    onDismissError: () -> Unit,
    onConfirmedSend: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedKey by remember { mutableStateOf<String?>(null) }
    var quantity by remember { mutableIntStateOf(1) }
    val openedAtCount = remember { state.confirmedSendCount }

    LaunchedEffect(state.confirmedSendCount) {
        if (state.confirmedSendCount > openedAtCount) onConfirmedSend()
    }

    val selected = state.catalog.firstOrNull { it.key == selectedKey }

    ModalBottomSheet(
        onDismissRequest = { if (!state.sending) onDismiss() },
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.live_gift_panel_title, hostName),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(end = Spacing.sm),
                )
                CoinBalanceChip(state = state, onRetry = onRetryBalance)
            }
            Text(
                text = stringResource(R.string.live_gift_top_up_web_only),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.xs),
            )

            Box(modifier = Modifier.fillMaxWidth().padding(top = Spacing.md)) {
                when {
                    state.catalogLoading && state.catalog.isEmpty() -> GiftGridSkeleton()
                    state.catalogError != null && state.catalog.isEmpty() -> Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xl),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = stringResource(R.string.live_gift_catalog_error),
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                        TextButton(onClick = onRetryCatalog) { Text(stringResource(R.string.action_retry)) }
                    }
                    state.catalog.isEmpty() -> ZrpEmptyState(
                        icon = Icons.Filled.CardGiftcard,
                        title = stringResource(R.string.live_gift_catalog_empty_title),
                        body = stringResource(R.string.live_gift_catalog_empty_body),
                    )
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 84.dp),
                        modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                    ) {
                        items(state.catalog, key = { it.id }) { gift ->
                            GiftCell(
                                gift = gift,
                                selected = gift.key == selectedKey,
                                onClick = {
                                    selectedKey = gift.key
                                    onDismissError()
                                },
                            )
                        }
                    }
                }
            }

            if (selected != null) {
                QuantityPicker(
                    quantity = quantity,
                    onQuantityChange = {
                        quantity = it.coerceIn(1, LIVE_GIFT_MAX_QUANTITY)
                        onDismissError()
                    },
                    modifier = Modifier.padding(top = Spacing.md),
                )
            }

            val errorText = liveErrorText(state.sendError)?.let { base ->
                if (state.sendError?.code == LiveApiException.CODE_NETWORK) {
                    stringResource(R.string.live_gift_unconfirmed)
                } else {
                    base
                }
            }
            if (errorText != null) {
                Text(
                    text = errorText,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }

            val total = selected?.let { giftTotalCoins(it.priceCoins, quantity) }
            val affordable = selected != null && canAffordGift(state.balance, selected.priceCoins, quantity)
            val balanceKnown = state.balance != null
            Button(
                onClick = { if (selected != null) onSend(selected.key, quantity) },
                enabled = selected != null && affordable && !state.sending,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = Color.White),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.md, bottom = Spacing.lg)
                    .heightIn(min = TouchTarget.min),
            ) {
                when {
                    state.sending -> {
                        CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), color = Color.White, strokeWidth = 2.dp)
                        Text(stringResource(R.string.live_gift_sending), modifier = Modifier.padding(start = Spacing.sm))
                    }
                    selected == null -> Text(stringResource(R.string.live_gift_select_prompt))
                    balanceKnown && !affordable -> Text(stringResource(R.string.live_gift_not_enough))
                    total != null && total <= Int.MAX_VALUE -> Text(
                        stringResource(
                            R.string.live_gift_send_with_total,
                            pluralStringResource(R.plurals.live_coins, total.toInt(), total.toInt()),
                        ),
                    )
                    else -> Text(stringResource(R.string.live_gift_send))
                }
            }
        }
    }
}

@Composable
private fun CoinBalanceChip(state: LiveGiftState, onRetry: () -> Unit) {
    val balance = state.balance
    when {
        balance != null -> {
            val label = pluralStringResource(R.plurals.live_coins, balance, balance)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs)
                    .semantics { contentDescription = label },
            ) {
                Icon(Icons.Filled.Paid, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(text = label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = Spacing.xs))
            }
        }
        state.balanceLoading -> CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), strokeWidth = 2.dp)
        state.balanceError != null -> TextButton(onClick = onRetry) {
            Text(stringResource(R.string.live_gift_balance_error), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun GiftCell(gift: LiveGift, selected: Boolean, onClick: () -> Unit) {
    val name = liveGiftDisplayName(gift.key)
    val priceLabel = pluralStringResource(R.plurals.live_coins, gift.priceCoins, gift.priceCoins)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.sm))
            .border(
                BorderStroke(if (selected) 2.dp else 1.dp, if (selected) ZrpRed else MaterialTheme.colorScheme.outlineVariant),
                RoundedCornerShape(Radius.sm),
            )
            .clickable(role = Role.Button, onClickLabel = name, onClick = onClick)
            .semantics { this.selected = selected }
            .padding(vertical = Spacing.sm, horizontal = Spacing.xs),
    ) {
        LiveGiftIcon(iconUrl = gift.iconUrl, size = 44.dp)
        Text(
            text = name,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.xs),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Paid, contentDescription = null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = priceLabel,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
    }
}

@Composable
private fun QuantityPicker(quantity: Int, onQuantityChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.live_gift_quantity),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { onQuantityChange(quantity - 1) }, enabled = quantity > 1) {
                Icon(Icons.Filled.RemoveCircleOutline, contentDescription = stringResource(R.string.live_gift_quantity_decrease))
            }
            Text(
                text = quantity.toString(),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(40.dp),
            )
            IconButton(onClick = { onQuantityChange(quantity + 1) }, enabled = quantity < LIVE_GIFT_MAX_QUANTITY) {
                Icon(Icons.Filled.AddCircle, contentDescription = stringResource(R.string.live_gift_quantity_increase))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            QUICK_QUANTITIES.forEach { value ->
                FilterChip(
                    selected = quantity == value,
                    onClick = { onQuantityChange(value) },
                    label = { Text(stringResource(R.string.live_gift_quantity_multiplier, value)) },
                )
            }
        }
    }
}

@Composable
private fun GiftGridSkeleton() {
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
        repeat(4) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(96.dp)
                    .clip(RoundedCornerShape(Radius.sm))
                    .background(MaterialTheme.colorScheme.surfaceContainerHighest),
            )
        }
    }
}
