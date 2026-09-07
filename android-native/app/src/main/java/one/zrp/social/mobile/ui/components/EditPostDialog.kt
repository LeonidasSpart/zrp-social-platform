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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R

/**
 * The native equivalent of the website's EditPostModal - text-only,
 * same as the web modal (it never touches the post's image either),
 * submitting to the same real PUT /posts/{id} the server enforces
 * author-only and plan-length-limit rules on. EditPostModal.tsx's own
 * title/placeholder/Save/Cancel copy is hardcoded English with zero
 * t() calls, so there's no web translation to source from - these are
 * translated as native-only supporting copy instead.
 */
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
                    placeholder = { Text(stringResource(R.string.editpost_placeholder)) },
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
                    Text(stringResource(R.string.action_save))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
