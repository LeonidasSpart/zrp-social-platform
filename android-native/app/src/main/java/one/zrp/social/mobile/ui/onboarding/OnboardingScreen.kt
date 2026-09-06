package one.zrp.social.mobile.ui.onboarding

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.OnboardingRepository
import one.zrp.social.mobile.network.SuggestedUser
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite

/**
 * The native onboarding flow shown right after a first login whose
 * account still has onboardingCompleted == false - see MainActivity's
 * own gating and OnboardingViewModel's KDoc. The same three real steps
 * (profile completion, follow suggestions, done) and the same real
 * endpoints src/app/onboarding/page.tsx itself calls, as a native
 * Compose UI rather than a copy of that page's own layout.
 */
@Composable
fun OnboardingScreen(onAccountMissing: () -> Unit, onFinished: () -> Unit) {
    val viewModel: OnboardingViewModel = viewModel(
        factory = remember {
            OnboardingViewModelFactory(OnboardingRepository(), onAccountMissing, onFinished)
        },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) viewModel.uploadAvatar(contentResolver, uri) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 24.dp, vertical = 32.dp),
    ) {
        StepIndicator(step = state.step)

        val error = state.error
        if (error != null) {
            Text(
                text = resolveErrorMessage(error),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.sm),
            )
        }

        Spacer(modifier = Modifier.height(Spacing.lg))

        when (state.step) {
            0 -> ProfileStep(
                state = state,
                onAvatarClick = { avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onNameChange = viewModel::onNameChange,
                onBioChange = viewModel::onBioChange,
                onLocationChange = viewModel::onLocationChange,
                onWebsiteChange = viewModel::onWebsiteChange,
            )
            1 -> FollowStep(
                suggestedUsers = state.suggestedUsers,
                following = state.following,
                onToggleFollow = viewModel::toggleFollow,
            )
            else -> DoneStep()
        }

        Spacer(modifier = Modifier.height(Spacing.lg))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.step < 2) {
                TextButton(onClick = viewModel::onSkip, enabled = !state.isSaving) {
                    Text(stringResource(R.string.onboarding_skip))
                }
            } else {
                Spacer(modifier = Modifier.width(1.dp))
            }

            Button(
                onClick = {
                    when (state.step) {
                        0 -> viewModel.onContinueFromProfile()
                        1 -> viewModel.onFinishFollowing()
                        else -> viewModel.onGoToHome()
                    }
                },
                enabled = !state.isSaving,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                modifier = Modifier.height(46.dp),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = ZrpWhite)
                } else {
                    Text(
                        text = stringResource(
                            when (state.step) {
                                0 -> R.string.onboarding_continue
                                1 -> R.string.onboarding_finish
                                else -> R.string.onboarding_go_to_home
                            },
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun resolveErrorMessage(error: OnboardingError): String = when (error) {
    is OnboardingError.Server -> error.message
    OnboardingError.SaveProfileFailed -> stringResource(R.string.onboarding_err_save_profile)
    OnboardingError.FollowUsersFailed -> stringResource(R.string.onboarding_err_follow_users)
    OnboardingError.SkipFailed -> stringResource(R.string.onboarding_err_skip)
    OnboardingError.AvatarUploadFailed -> stringResource(R.string.profile_upload_avatar_failed)
}

@Composable
private fun StepIndicator(step: Int) {
    val labels = listOf(
        stringResource(R.string.onboarding_step_profile),
        stringResource(R.string.onboarding_step_follow),
        stringResource(R.string.onboarding_step_done),
    )
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        labels.forEachIndexed { index, _ ->
            val isActiveOrDone = index <= step
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(
                        if (isActiveOrDone) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh,
                        MaterialTheme.shapes.extraLarge,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (index < step) {
                    Icon(Icons.Filled.Check, contentDescription = null, tint = ZrpWhite, modifier = Modifier.size(16.dp))
                } else {
                    Text(
                        text = (index + 1).toString(),
                        color = if (isActiveOrDone) ZrpWhite else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
            if (index < labels.lastIndex) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(2.dp)
                        .background(if (index < step) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh),
                )
            }
        }
    }
}

@Composable
private fun ProfileStep(
    state: OnboardingUiState,
    onAvatarClick: () -> Unit,
    onNameChange: (String) -> Unit,
    onBioChange: (String) -> Unit,
    onLocationChange: (String) -> Unit,
    onWebsiteChange: (String) -> Unit,
) {
    Column {
        Text(stringResource(R.string.onboarding_welcome_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            text = stringResource(R.string.onboarding_setup_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.xs, bottom = Spacing.lg),
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                Avatar(url = state.avatarUrl, name = state.name.ifBlank { "?" }, size = 64.dp)
                IconButton(
                    onClick = onAvatarClick,
                    enabled = !state.isUploadingAvatar,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(26.dp)
                        .background(Color.Black.copy(alpha = 0.6f), MaterialTheme.shapes.extraLarge),
                ) {
                    if (state.isUploadingAvatar) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = ZrpWhite)
                    } else {
                        Icon(Icons.Filled.CameraAlt, contentDescription = stringResource(R.string.onboarding_upload), tint = ZrpWhite, modifier = Modifier.size(14.dp))
                    }
                }
            }
            TextButton(onClick = onAvatarClick, enabled = !state.isUploadingAvatar) {
                Text(stringResource(R.string.onboarding_upload))
            }
        }

        Text(
            text = stringResource(R.string.onboarding_display_name),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.md),
        )
        OutlinedTextField(
            value = state.name,
            onValueChange = onNameChange,
            placeholder = { Text(stringResource(R.string.onboarding_display_name_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
        )

        Text(
            text = stringResource(R.string.onboarding_bio),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.md),
        )
        OutlinedTextField(
            value = state.bio,
            onValueChange = onBioChange,
            placeholder = { Text(stringResource(R.string.onboarding_bio_placeholder)) },
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
        )
        Text(
            text = "${state.bio.length}/160",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Text(
            text = stringResource(R.string.onboarding_location_label),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        OutlinedTextField(
            value = state.location,
            onValueChange = onLocationChange,
            placeholder = { Text(stringResource(R.string.onboarding_location_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
        )

        Text(
            text = stringResource(R.string.onboarding_website),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.md),
        )
        OutlinedTextField(
            value = state.website,
            onValueChange = onWebsiteChange,
            placeholder = { Text(stringResource(R.string.onboarding_website_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
        )
    }
}

@Composable
private fun FollowStep(
    suggestedUsers: List<SuggestedUser>,
    following: Set<String>,
    onToggleFollow: (String) -> Unit,
) {
    Column {
        Text(stringResource(R.string.onboarding_follow_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            text = stringResource(R.string.onboarding_follow_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.xs, bottom = Spacing.md),
        )

        if (suggestedUsers.isEmpty()) {
            Text(
                text = stringResource(R.string.onboarding_no_suggestions),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                items(suggestedUsers, key = { it.id }) { user ->
                    SuggestedUserRow(
                        user = user,
                        isFollowing = following.contains(user.id),
                        onClick = { onToggleFollow(user.id) },
                    )
                }
            }
            Text(
                text = stringResource(R.string.onboarding_users_selected, following.size),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

@Composable
private fun SuggestedUserRow(user: SuggestedUser, isFollowing: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 44.dp)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = user.name ?: user.username,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                VerifiedBadge(badgeType = user.badgeType, size = 16.dp, modifier = Modifier.padding(start = Spacing.xs))
            }
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Button(
            onClick = onClick,
            shape = MaterialTheme.shapes.large,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isFollowing) MaterialTheme.colorScheme.surfaceContainerHigh else ZrpRed,
                contentColor = if (isFollowing) MaterialTheme.colorScheme.onSurface else ZrpWhite,
            ),
        ) {
            Text(stringResource(if (isFollowing) R.string.action_following else R.string.action_follow))
        }
    }
}

@Composable
private fun DoneStep() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "🎉", style = MaterialTheme.typography.displayMedium)
        Text(
            text = stringResource(R.string.onboarding_done_title),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = Spacing.md),
        )
        Text(
            text = stringResource(R.string.onboarding_done_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.xs),
        )
    }
}
