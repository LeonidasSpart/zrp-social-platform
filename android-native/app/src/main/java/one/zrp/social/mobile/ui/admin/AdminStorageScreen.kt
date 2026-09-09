package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminStorageScan
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Ported from src/app/admin/storage/page.tsx - see
 * AdminStorageViewModel's own KDoc for the two-step scan/delete flow
 * and the route's ADMIN-only gate.
 *
 * The delete confirmation is deliberately specific rather than a
 * generic "are you sure": it names the real orphan count and the real
 * size the route just reported, which is exactly what the website's own
 * window.confirm on this page says (adminStorage.confirmDelete). There
 * is no undo behind it - the files are gone from UploadThing.
 */
@Composable
fun AdminStorageScreen(onBack: () -> Unit) {
    val viewModel: AdminStorageViewModel = viewModel(
        factory = remember { AdminStorageViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

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
                text = stringResource(R.string.admin_storage_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
        ) {
            Text(
                text = stringResource(R.string.admin_storage_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            val deletedCount = state.deletedCount
            val deletedOutOf = state.deletedOutOf
            if (deletedCount != null && deletedOutOf != null) {
                Text(
                    text = stringResource(
                        R.string.admin_storage_deleted_message,
                        deletedCount.toString(),
                        deletedOutOf.toString(),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.md),
                )
            }

            OutlinedButton(
                onClick = { viewModel.scan() },
                enabled = !state.isScanning && !state.isDeleting,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            ) {
                if (state.isScanning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp).padding(end = 2.dp),
                        strokeWidth = 2.dp,
                    )
                    Text(
                        text = stringResource(R.string.admin_storage_scanning),
                        modifier = Modifier.padding(start = Spacing.sm),
                    )
                } else {
                    Text(stringResource(R.string.admin_storage_scan_button))
                }
            }

            val scan = state.scan
            if (scan != null) {
                StorageScanResult(scan)

                val orphanedCount = scan.orphanedCount
                if (orphanedCount > 0) {
                    OutlinedButton(
                        onClick = { viewModel.requestDelete() },
                        enabled = !state.isDeleting && !state.isScanning,
                        modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                    ) {
                        if (state.isDeleting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp).padding(end = 2.dp),
                                strokeWidth = 2.dp,
                            )
                            Text(
                                text = stringResource(R.string.admin_storage_deleting),
                                modifier = Modifier.padding(start = Spacing.sm),
                            )
                        } else {
                            Text(
                                text = stringResource(
                                    R.string.admin_storage_delete_button,
                                    orphanedCount.toString(),
                                ),
                                color = ZrpRed,
                            )
                        }
                    }
                }
            }
        }
    }

    val scan = state.scan
    if (state.showDeleteConfirm && scan != null) {
        // Read out of the scan before the dialog's own lambdas so the
        // confirmation names the exact count and size this scan
        // reported, not whatever the state happens to hold later.
        val orphanedCount = scan.orphanedCount.toString()
        val orphanedSize = formatSizeMb(scan.orphanedSizeMB)
        AlertDialog(
            onDismissRequest = { viewModel.cancelDelete() },
            title = {
                Text(stringResource(R.string.admin_storage_delete_button, orphanedCount))
            },
            text = {
                Text(
                    stringResource(
                        R.string.admin_storage_confirm_delete,
                        orphanedCount,
                        orphanedSize,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmDelete() }) {
                    Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelDelete() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }
}

@Composable
private fun StorageScanResult(scan: AdminStorageScan) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg)) {
        val cards = listOf(
            stringResource(R.string.admin_storage_stat_in_uploadthing) to scan.totalFilesInUploadThing.toString(),
            stringResource(R.string.admin_storage_stat_referenced_in_db) to scan.totalReferencedInDb.toString(),
            stringResource(R.string.admin_storage_stat_orphaned) to scan.orphanedCount.toString(),
            stringResource(R.string.admin_storage_stat_orphaned_size) to
                "${formatSizeMb(scan.orphanedSizeMB)} MB",
        )
        // A real (non-lazy) grid - this screen is already inside a
        // verticalScroll Column, where a Lazy* layout would be measured
        // with an unbounded max height and crash.
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            cards.chunked(2).forEach { rowCards ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    rowCards.forEach { (label, value) ->
                        Box(modifier = Modifier.weight(1f)) {
                            StorageStatCard(label = label, value = value)
                        }
                    }
                    if (rowCards.size < 2) {
                        Box(modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        // The grace-period set: unreferenced, but too recently uploaded
        // to be safely deletable, so the route never includes it in a
        // cleanup. Shown so the numbers add up rather than looking like
        // orphans the tool silently missed.
        if (scan.heldForReviewCount > 0) {
            Text(
                text = stringResource(
                    R.string.admin_storage_stat_held_for_review_summary,
                    scan.heldForReviewCount.toString(),
                    formatSizeMb(scan.heldForReviewSizeMB),
                ),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = Spacing.md),
            )
            Text(
                text = stringResource(
                    R.string.admin_storage_held_for_review_hint,
                    scan.heldForReviewCount.toString(),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        if (scan.orphanedCount == 0) {
            Text(
                text = stringResource(R.string.admin_storage_nothing_orphaned),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.lg),
            )
        } else {
            scan.sample.forEach { file ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = file.name.orEmpty().ifBlank { file.key },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = formatBytes(file.size),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = Spacing.sm),
                    )
                }
            }
            if (scan.orphanedCount > scan.sample.size) {
                Text(
                    text = stringResource(
                        R.string.admin_storage_showing_sample,
                        scan.sample.size.toString(),
                        scan.orphanedCount.toString(),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.md),
                )
            }
        }
    }
}

@Composable
private fun StorageStatCard(label: String, value: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(text = value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = ZrpRed)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

/**
 * The route already rounds its MB figures to two decimals, so this only
 * drops a pointless trailing ".0" the same way the website's own
 * rendering of the raw number does.
 */
private fun formatSizeMb(sizeMb: Double): String =
    if (sizeMb == sizeMb.toLong().toDouble()) sizeMb.toLong().toString()
    else sizeMb.toString()

/**
 * Ported verbatim from the website's own formatBytes() on this page,
 * unit suffixes included - those are hardcoded there too, not
 * translated.
 */
private fun formatBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 KB"
    val mb = bytes / (1024.0 * 1024.0)
    return if (mb >= 1) "%.2f MB".format(Locale.getDefault(), mb)
    else "%.1f KB".format(Locale.getDefault(), bytes / 1024.0)
}
