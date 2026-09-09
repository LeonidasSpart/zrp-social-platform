package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.ui.components.EmptyStateAction
import one.zrp.social.mobile.ui.components.ZrpEmptyState

/**
 * Resolves a conversation partner's real userId from just their
 * username, then hands off to the real ConversationScreen - the one
 * piece a "New Message" push notification's deep link
 * (`https://zrp.one/messages/{username}`, sent by sendPushNotification
 * in src/app/api/messages/route.ts) carries. Unlike ProfileScreen/
 * TrustPassportScreen, which render entirely from a username,
 * ConversationScreen needs a real partnerId to call
 * GET /messages/{userId} - this reuses the exact same real
 * GET /users/{username} lookup ProfileScreen already calls for that,
 * rather than adding a second identity-resolution path. Tapping the
 * notification used to only open the conversation LIST (the one deep
 * link ZrpNavHost previously registered for /messages) - this is what
 * actually lands on the right thread.
 */
@Composable
fun MessageDeepLinkScreen(
    username: String,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    var partnerId by remember(username) { mutableStateOf<String?>(null) }
    var error by remember(username) { mutableStateOf<String?>(null) }
    var retryToken by remember(username) { mutableIntStateOf(0) }

    LaunchedEffect(username, retryToken) {
        partnerId = null
        error = null
        ProfileRepository().getProfile(username)
            .onSuccess { partnerId = it.id }
            .onFailure { error = it.message ?: "Couldn't load this conversation." }
    }

    val resolvedPartnerId = partnerId
    val loadError = error
    when {
        resolvedPartnerId != null -> ConversationScreen(
            partnerId = resolvedPartnerId,
            partnerUsername = username,
            onBack = onBack,
            onOpenProfile = { onOpenProfile(username) },
        )
        loadError != null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            ZrpEmptyState(
                icon = Icons.Filled.CloudOff,
                title = loadError,
                primaryAction = EmptyStateAction(
                    label = stringResource(R.string.feed_retry),
                    onClick = { retryToken++ },
                ),
            )
        }
        else -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    }
}
