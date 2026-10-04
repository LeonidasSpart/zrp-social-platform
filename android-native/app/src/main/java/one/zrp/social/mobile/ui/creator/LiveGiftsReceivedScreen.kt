package one.zrp.social.mobile.ui.creator

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveApiException
import one.zrp.social.mobile.data.LiveInteractionsRepository
import one.zrp.social.mobile.network.CreatorGiftTransaction
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EmptyStateAction
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.live.liveErrorText
import one.zrp.social.mobile.ui.live.liveGiftDisplayName
import one.zrp.social.mobile.ui.live.LiveGiftIcon
import one.zrp.social.mobile.ui.theme.Spacing

data class LiveGiftsReceivedUiState(
    val isLoading: Boolean = true,
    val gifts: List<CreatorGiftTransaction> = emptyList(),
    val error: LiveApiException? = null,
)

class LiveGiftsReceivedViewModel(
    private val repository: LiveInteractionsRepository = LiveInteractionsRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(LiveGiftsReceivedUiState())
    val state: StateFlow<LiveGiftsReceivedUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getCreatorGifts()
                .onSuccess { response -> _state.update { it.copy(isLoading = false, gifts = response.gifts) } }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoading = false, error = error as? LiveApiException ?: LiveApiException(LiveApiException.CODE_UNKNOWN, 0, error.message, null))
                    }
                }
        }
    }
}

class LiveGiftsReceivedViewModelFactory : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LiveGiftsReceivedViewModel() as T
}

/**
 * Gifts received while live - the host's own ledger from the real
 * GET /creator/gifts (getGiftHistoryForCreator: newest first, the last
 * 50). Each row's USD figure is the creator's share after the platform
 * fee, the same `creatorAmount` that was credited to the withdrawable
 * Creator Studio balance - formatted exactly like the Tips list.
 */
@Composable
fun LiveGiftsReceivedScreen(onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val viewModel: LiveGiftsReceivedViewModel = viewModel(factory = remember { LiveGiftsReceivedViewModelFactory() })
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.creator_live_gifts_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
        HorizontalDivider()

        when {
            state.isLoading && state.gifts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null && state.gifts.isEmpty() -> ZrpEmptyState(
                icon = Icons.Filled.CardGiftcard,
                title = stringResource(R.string.creator_live_gifts_error),
                body = liveErrorText(state.error),
                primaryAction = EmptyStateAction(label = stringResource(R.string.action_retry), onClick = viewModel::refresh),
            )
            state.gifts.isEmpty() -> ZrpEmptyState(
                icon = Icons.Filled.CardGiftcard,
                title = stringResource(R.string.creator_live_gifts_empty_title),
                body = stringResource(R.string.creator_live_gifts_empty_body),
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs),
            ) {
                items(state.gifts, key = { it.id }) { gift -> GiftRow(gift, onOpenProfile) }
            }
        }
    }
}

@Composable
private fun GiftRow(gift: CreatorGiftTransaction, onOpenProfile: (String) -> Unit) {
    val senderName = gift.sender.name ?: gift.sender.username
    val giftName = liveGiftDisplayName(gift.giftDefinition.key)
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClickLabel = senderName) { onOpenProfile(gift.sender.username) }
                .padding(Spacing.md),
        ) {
            Avatar(url = gift.sender.avatarUrl, name = senderName, size = 36.dp)
            Column(modifier = Modifier.weight(1f).padding(horizontal = Spacing.sm)) {
                Text(
                    text = senderName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.creator_live_gift_row, giftName, gift.quantity),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = formatCreatorDate(gift.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                LiveGiftIcon(iconUrl = gift.giftDefinition.iconUrl, size = 28.dp)
                Text(text = formatCreatorUsd(gift.creatorAmount), style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = pluralStringResource(R.plurals.live_coins, gift.totalCoins, gift.totalCoins),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
