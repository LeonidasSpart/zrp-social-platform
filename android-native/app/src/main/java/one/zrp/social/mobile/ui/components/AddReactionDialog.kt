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
 * None of this dialog's copy has a web string to source from (the
 * emoji-picker-react grid it replaces has no title/label of its own,
 * and ChatInterface.tsx's own "React" trigger is an icon-only button
 * with a hardcoded, untranslated aria-label), so all of it is
 * translated as native-only supporting copy instead.
 */
@Composable
fun AddReactionDialog(
    onDismiss: () -> Unit,
    onSubmit: (emoji: String) -> Unit,
) {
    var emoji by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.reaction_add_title)) },
        text = {
            OutlinedTextField(
                value = emoji,
                onValueChange = { if (it.length <= 8) emoji = it },
                label = { Text(stringResource(R.string.reaction_emoji_label)) },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = { onSubmit(emoji) }, enabled = emoji.isNotBlank()) {
                Text(stringResource(R.string.reaction_react_action))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
