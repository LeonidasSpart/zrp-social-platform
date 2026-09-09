package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminListing
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import java.util.Locale

// The real ListingStatus values the website's own review page filters
// on, verbatim.
private val STATUS_FILTERS = listOf("PENDING_REVIEW", "ACTIVE", "REJECTED", "REMOVED", "all")

/** Ported from src/app/admin/marketplace/page.tsx - see AdminApi's own KDoc. */
@Composable
fun AdminMarketplaceScreen(onBack: () -> Unit) {
    val viewModel: AdminMarketplaceViewModel = viewModel(
        factory = remember { AdminMarketplaceViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            viewModel.consumeError()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.admin_marketplace_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            STATUS_FILTERS.forEach { status ->
                FilterChip(
                    selected = state.statusFilter == status,
                    onClick = { viewModel.setStatusFilter(status) },
                    label = { Text(submissionStatusLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.listings.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_marketplace_no_listings),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.listings, key = { it.id }) { listing ->
                    ListingRow(
                        listing = listing,
                        isUpdating = state.updatingId == listing.id,
                        onApprove = { viewModel.approve(listing.id) },
                        onReject = { viewModel.openReasonModal(listing.id, "reject") },
                        onRemove = { viewModel.openReasonModal(listing.id, "remove") },
                    )
                }
            }

            if (state.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { viewModel.setPage(state.page - 1) }, enabled = state.page > 1) {
                        Text(stringResource(R.string.admin_reports_previous))
                    }
                    Text(
                        text = stringResource(R.string.admin_reports_page_of, state.page, state.totalPages),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    TextButton(onClick = { viewModel.setPage(state.page + 1) }, enabled = state.page < state.totalPages) {
                        Text(stringResource(R.string.admin_reports_next))
                    }
                }
            }
        }
    }

    val reasonAction = state.reasonModalAction
    if (state.reasonModalListingId != null && reasonAction != null) {
        ReviewReasonDialog(
            action = reasonAction,
            onDismiss = { viewModel.closeReasonModal() },
            onConfirm = { reason -> viewModel.submitReasonAction(reason) },
        )
    }
}

/**
 * Money columns are real Decimals server-side and reach the client as
 * plain JSON numbers (see AdminApi's own note), so a whole amount would
 * otherwise render with a trailing ".0". Shared with the HELP review
 * queue, which formats raised/goal amounts the same way.
 */
internal fun formatMoney(amount: Double): String =
    if (amount == amount.toLong().toDouble()) {
        amount.toLong().toString()
    } else {
        // Locale.US for the same reason CreatorFormatting.kt pins it -
        // these are raw amounts printed next to their own currency
        // code, not locale-formatted currency.
        String.format(Locale.US, "%.2f", amount)
    }

/**
 * Shared by every submission-review queue (marketplace, opportunity and
 * HELP all use the same four-value status enum plus "all").
 */
@Composable
internal fun submissionStatusLabel(status: String): String = when (status) {
    "PENDING_REVIEW" -> stringResource(R.string.admin_review_status_pending_review)
    "ACTIVE" -> stringResource(R.string.admin_review_status_active)
    "REJECTED" -> stringResource(R.string.admin_review_status_rejected)
    "REMOVED" -> stringResource(R.string.admin_review_status_removed)
    else -> stringResource(R.string.admin_reports_all)
}

/**
 * The confirm step for the two destructive submission actions - reject
 * (a pending submission) and remove (a live one), both of which take an
 * optional reason that is stored on the row and shown to its owner.
 */
@Composable
internal fun ReviewReasonDialog(
    action: String,
    onDismiss: () -> Unit,
    onConfirm: (reason: String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    val title = if (action == "remove") {
        stringResource(R.string.admin_review_remove)
    } else {
        stringResource(R.string.admin_review_reject)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(stringResource(R.string.admin_reports_note_optional)) },
                placeholder = { Text(stringResource(R.string.admin_reports_note_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason) }) {
                Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_cancel)) }
        },
    )
}

@Composable
private fun ListingRow(
    listing: AdminListing,
    isUpdating: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = listing.title,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = submissionStatusLabel(listing.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Text(
            text = stringResource(R.string.admin_review_by, listing.seller.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        // Price is null (or explicitly on request) for a good part of
        // this catalogue - the real ListingSummary shape, matching how
        // the web page's own formatListingPrice falls back.
        val price = listing.price
        val priceLabel = when {
            listing.priceOnRequest || price == null -> stringResource(R.string.admin_marketplace_price_on_request)
            else -> "${listing.currency} ${formatMoney(price)}"
        }
        Text(
            text = if (listing.location.isNullOrBlank()) priceLabel else "$priceLabel · ${listing.location}",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!listing.rejectionReason.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_review_reason_label, listing.rejectionReason),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else if (listing.status == "PENDING_REVIEW") {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onApprove) { Text(stringResource(R.string.admin_review_approve)) }
                TextButton(onClick = onReject) {
                    Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                }
            }
        } else if (listing.status == "ACTIVE") {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onRemove) {
                    Text(stringResource(R.string.admin_review_remove), color = ZrpRed)
                }
            }
        }
    }
}
