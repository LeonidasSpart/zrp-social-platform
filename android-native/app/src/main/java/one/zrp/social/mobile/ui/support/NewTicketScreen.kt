package one.zrp.social.mobile.ui.support

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SupportRepository
import one.zrp.social.mobile.network.SUPPORT_CATEGORIES
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP Support - ported from src/app/support/page.tsx: the create-
 * ticket form. See NewTicketViewModel's own KDoc for why there's no
 * separate client-side validation message.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTicketScreen(onBack: () -> Unit, onSubmitted: () -> Unit, onOpenMyTickets: () -> Unit) {
    val viewModel: NewTicketViewModel = viewModel(
        factory = remember { NewTicketViewModelFactory(SupportRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var categoryMenuExpanded by remember { mutableStateOf(false) }

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
                text = stringResource(R.string.support_page_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
        ) {
            Text(
                text = stringResource(R.string.support_page_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (state.error != null) {
                Text(
                    text = state.error ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = Spacing.md),
                )
            }

            OutlinedTextField(
                value = state.subject,
                onValueChange = viewModel::onSubjectChange,
                label = { Text(stringResource(R.string.support_subject_label)) },
                placeholder = { Text(stringResource(R.string.support_subject_placeholder)) },
                singleLine = true,
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
            )

            Text(
                text = stringResource(R.string.support_category_label),
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = Spacing.md),
            )
            ExposedDropdownMenuBox(
                expanded = categoryMenuExpanded,
                onExpandedChange = { categoryMenuExpanded = it },
                modifier = Modifier.padding(top = 4.dp),
            ) {
                OutlinedTextField(
                    value = supportCategoryLabel(state.category),
                    onValueChange = {},
                    readOnly = true,
                    enabled = !state.isSubmitting,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                    SUPPORT_CATEGORIES.forEach { category ->
                        DropdownMenuItem(
                            text = { Text(supportCategoryLabel(category)) },
                            onClick = { viewModel.onCategoryChange(category); categoryMenuExpanded = false },
                        )
                    }
                }
            }

            OutlinedTextField(
                value = state.message,
                onValueChange = viewModel::onMessageChange,
                label = { Text(stringResource(R.string.support_message_label)) },
                placeholder = { Text(stringResource(R.string.support_message_placeholder)) },
                enabled = !state.isSubmitting,
                minLines = 6,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            Button(
                onClick = { viewModel.submit(onSubmitted) },
                enabled = !state.isSubmitting && state.subject.isNotBlank() && state.message.isNotBlank(),
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text(stringResource(R.string.support_submitting), modifier = Modifier.padding(start = 8.dp))
                } else {
                    Text(stringResource(R.string.support_submit_ticket))
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.support_footer_note_p1),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                TextButton(onClick = onOpenMyTickets) {
                    Text(stringResource(R.string.support_footer_note_link), color = ZrpRed, style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    text = stringResource(R.string.support_footer_note_p2),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
