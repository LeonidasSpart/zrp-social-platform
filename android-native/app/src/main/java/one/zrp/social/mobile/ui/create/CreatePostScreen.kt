package one.zrp.social.mobile.ui.create

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The Create tab's composer - a real POST /api/posts call, text-only
 * for now. Media attachment goes through UploadThing's presigned-
 * upload SDK on the website rather than a plain REST call, and needs
 * its own native upload path (see PostsApi.createPost's comment);
 * shipping real, working text posts now rather than an untested
 * native upload flow in the same change.
 *
 * When [quotePostId] is set, this doubles as the Quote-post composer
 * reached from a post's repost menu, showing a read-only preview of
 * the real post being quoted - the same real post GET /posts/{id}
 * returns, not a locally reconstructed guess - above the text field,
 * matching the website's QuotePostModal.
 */
@Composable
fun CreatePostScreen(onPosted: () -> Unit, quotePostId: String? = null) {
    val viewModel: CreatePostViewModel = viewModel(
        factory = remember(quotePostId) { CreatePostViewModelFactory(PostsRepository(), quotePostId) },
    )
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
        if (quotePostId != null) {
            // "Quote Post" stays English-only on purpose - matches
            // QuotePostModal.tsx's own hardcoded, untranslated title.
            Text(
                text = "Quote Post",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = Spacing.sm),
            )

            val quotedPost = state.quotedPost
            when {
                state.isLoadingQuotedPost -> {
                    Box(modifier = Modifier.fillMaxWidth().padding(Spacing.md), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                quotedPost != null -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.medium)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .padding(Spacing.md),
                    ) {
                        Avatar(
                            url = quotedPost.author.avatarUrl,
                            name = quotedPost.author.name ?: quotedPost.author.username,
                            size = 32.dp,
                        )
                        Column(modifier = Modifier.padding(start = Spacing.sm)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = quotedPost.author.name ?: quotedPost.author.username,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                VerifiedBadge(
                                    badgeType = quotedPost.author.badgeType,
                                    modifier = Modifier.padding(start = 3.dp),
                                )
                            }
                            Text(
                                text = quotedPost.content,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }
            }
        }

        OutlinedTextField(
            value = state.content,
            onValueChange = { viewModel.onContentChange(it) },
            // The quote-post placeholder ("Add your thoughts...") stays
            // English-only on purpose too - QuotePostModal.tsx's own
            // placeholder is hardcoded the same way. The default placeholder
            // uses PostComposer.tsx's real, translated copy.
            placeholder = {
                Text(if (quotePostId != null) "Add your thoughts..." else stringResource(R.string.composer_placeholder_default))
            },
            enabled = !state.isPosting,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(top = if (quotePostId != null) Spacing.sm else 0.dp),
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
                    // "Quote" (the quote-post case) stays English-only on
                    // purpose too - QuotePostModal.tsx's own submit button
                    // is hardcoded the same way.
                    Text(if (quotePostId != null) "Quote" else stringResource(R.string.composer_post_button))
                }
            }
        }
    }
}
