package one.zrp.social.mobile.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R

/**
 * The website opens a full emoji-picker-react grid here to pick any
 * Unicode emoji. Every Android keyboard (Gboard included) already ships
 * its own system emoji picker, so this dialog is just a plain text
 * field the user types/pastes an emoji into via that keyboard - the
 * same "any real emoji" capability the website offers, through the
 * platform's own picker rather than a second one built into the app.
 *
 * "Add a reaction" and "Emoji" stay English-only: they exist only to
 * explain this native text-field substitute, and the real
 * emoji-picker-react grid it replaces has no title or label text of
 * its own to translate from. "React" matches ChatInterface.tsx's own
 * hardcoded, untranslated aria-label="React" (same reuse as the
 * DropdownMenuItem in ConversationScreen.kt).
 */
@Composable
fun AddReactionDialog(
    onDismiss: () -> Unit,
    onSubmit: (emoji: String) -> Unit,
) {
    var emoji by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a reaction") },
        text = {
            OutlinedTextField(
                value = emoji,
                onValueChange = { if (it.length <= 8) emoji = it },
                label = { Text("Emoji") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = { onSubmit(emoji) }, enabled = emoji.isNotBlank()) {
                Text("React")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
