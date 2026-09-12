package one.zrp.social.mobile.ui.navigation

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite

/**
 * The shared top bar for the four bottom-bar "home" screens (Home,
 * Explore, Messages, Profile) - hamburger menu on the left (opens the
 * left drawer), the ZRP wordmark centered, and a bell on the right that
 * carries the notifications unread badge (Notifications moved off the
 * bottom bar in the redesign; the bell plus the drawer's own
 * Notifications row are the two ways to reach it now).
 *
 * Deliberately NOT shown on every screen in the graph - only these four
 * routes register it (see ZrpNavHost's Scaffold), so a drill-down screen
 * (Settings, a conversation thread, another user's profile) keeps its
 * own existing back-button header instead of stacking a second bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZrpTopBar(
    unreadNotifications: Int,
    onMenuClick: () -> Unit,
    onNotificationsClick: () -> Unit,
) {
    TopAppBar(
        title = {
            // The reference design's top bar carries the compact "ZRP"
            // wordmark (white "Z" + red "RP"), not the full "ZRP Social"
            // install name - the same two-tone split the brand's own
            // logo mark uses elsewhere. Screen readers still get the
            // full app name via the row's own content description
            // below, so nothing is lost for accessibility by shortening
            // the visible text.
            val appNameDescription = stringResource(R.string.app_name)
            Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(color = ZrpWhite)) { append("Z") }
                    withStyle(SpanStyle(color = ZrpRed)) { append("RP") }
                },
                fontWeight = FontWeight.Black,
                fontSize = 20.sp,
                modifier = Modifier.semantics {
                    contentDescription = appNameDescription
                },
            )
        },
        navigationIcon = {
            IconButton(onClick = onMenuClick, modifier = Modifier.size(TouchTarget.comfortable)) {
                Icon(
                    imageVector = Icons.Filled.Menu,
                    contentDescription = stringResource(R.string.drawer_open_menu),
                    modifier = Modifier.size(IconSize.md),
                )
            }
        },
        actions = {
            IconButton(onClick = onNotificationsClick, modifier = Modifier.size(TouchTarget.comfortable)) {
                if (unreadNotifications > 0) {
                    BadgedBox(
                        badge = {
                            Badge {
                                Text(if (unreadNotifications > 99) "99+" else unreadNotifications.toString())
                            }
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Notifications,
                            contentDescription = stringResource(R.string.nav_notifications),
                            modifier = Modifier.size(IconSize.md),
                        )
                    }
                } else {
                    Icon(
                        imageVector = Icons.Filled.Notifications,
                        contentDescription = stringResource(R.string.nav_notifications),
                        modifier = Modifier.size(IconSize.md),
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        ),
    )
}
