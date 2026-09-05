package one.zrp.social.mobile.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Shared shell for a not-yet-implemented native screen. Each real
 * screen (HomeScreen, SearchScreen, etc.) replaces its call to this
 * with real content in its own phase (see the migration plan) - this
 * exists so ZrpNavHost has somewhere real to navigate to today rather
 * than the foundation phase blocking on every screen being finished
 * at once.
 */
@Composable
fun PlaceholderScreen(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
fun CreateScreen() = PlaceholderScreen("New post")

@Composable
fun NotificationsScreen() = PlaceholderScreen("Notifications")

@Composable
fun MessagesScreen() = PlaceholderScreen("Messages")

@Composable
fun ProfileScreen() = PlaceholderScreen("Profile")
