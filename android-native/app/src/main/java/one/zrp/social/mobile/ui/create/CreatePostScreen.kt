package one.zrp.social.mobile.ui.create

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The Create tab's composer - a real POST /api/posts call, text-only
 * for now. Media attachment goes through UploadThing's presigned-
 * upload SDK on the website rather than a plain REST call, and needs
 * its own native upload path (see PostsApi.createPost's comment);
 * shipping real, working text posts now rather than an untested
 * native upload flow in the same change.
 */
@Composable
fun CreatePostScreen(onPosted: () -> Unit) {
    val viewModel: CreatePostViewModel = viewModel(factory = CreatePostViewModelFactory(PostsRepository()))
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.posted) {
        if (state.posted) {
            viewModel.consumePostedEvent()
            onPosted()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        OutlinedTextField(
            value = state.content,
            onValueChange = { viewModel.onContentChange(it) },
            placeholder = { Text("What's happening on ZRP?") },
            enabled = !state.isPosting,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "${state.content.length} characters",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Button(
                onClick = { viewModel.submit() },
                enabled = state.content.isNotBlank() && !state.isPosting,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            ) {
                if (state.isPosting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Post")
                }
            }
        }
    }
}
