package one.zrp.social.mobile.ui.stories

import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The story composer - a real POST /stories call, text-only for now
 * (see StoriesApi's KDoc). Stories expire after 24 hours server-side,
 * so unlike posts there's no character-limit hint to show here.
 */
@Composable
fun CreateStoryScreen(onPosted: () -> Unit) {
    val viewModel: CreateStoryViewModel = viewModel(factory = CreateStoryViewModelFactory(StoriesRepository()))
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
        Text(
            text = "Add to your story",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 16.dp),
        )

        OutlinedTextField(
            value = state.content,
            onValueChange = { viewModel.onContentChange(it) },
            placeholder = { Text("Share something that disappears in 24 hours") },
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

        Button(
            onClick = { viewModel.submit() },
            enabled = state.content.isNotBlank() && !state.isPosting,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
        ) {
            if (state.isPosting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text("Share to story")
            }
        }
    }
}
