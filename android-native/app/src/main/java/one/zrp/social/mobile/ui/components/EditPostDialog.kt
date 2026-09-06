package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The native equivalent of the website's EditPostModal - text-only,
 * same as the web modal (it never touches the post's image either),
 * submitting to the same real PUT /posts/{id} the server enforces
 * author-only and plan-length-limit rules on.
 */
// Every string below stays English on purpose: EditPostModal.tsx (the
// website's own equivalent for editing a post) has zero t() calls
// anywhere - title, placeholder, Save/Saving.../Cancel are all its own
// hardcoded, untranslated copy, byte-matched here rather than sourced
// from a translated key used elsewhere (e.g. action.cancel) that real
// web visitors would never actually see in this dialog.
@Composable
fun EditPostDialog(
    initialContent: String,
    isSubmitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (content: String) -> Unit,
    title: String = "Edit Post",
) {
    var content by remember { mutableStateOf(initialContent) }

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it },
                    placeholder = { Text("What's happening?") },
                    enabled = !isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (error != null) {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(
                    onClick = { onSubmit(content) },
                    enabled = content.isNotBlank(),
                ) {
                    Text("Save")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text("Cancel")
            }
        },
    )
}
