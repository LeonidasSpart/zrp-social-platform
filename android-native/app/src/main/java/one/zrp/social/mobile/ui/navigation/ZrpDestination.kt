package one.zrp.social.mobile.ui.navigation

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.ui.graphics.vector.ImageVector
import one.zrp.social.mobile.R

/**
 * The named top-level destinations of the ZRP mobile app.
 *
 * Redesign note: this enum is the canonical route holder for every
 * top-level screen (its `.route` is referenced directly by the NavHost's
 * `composable(route = ...)` registrations, not only by the bottom bar),
 * so a destination that moved OUT of the bottom bar (Notifications) stays
 * in this enum rather than being deleted - only `isBottomBarItem` changed,
 * so every existing `ZrpDestination.Notifications.route` reference
 * elsewhere in the nav graph keeps working unchanged.
 *
 * Bottom bar is exactly five items: Home, Explore, Create, Messages,
 * Profile - `ZrpBottomBar` filters on `isBottomBarItem` rather than
 * iterating every entry. "Search" was renamed "Explore" in place (same
 * route, "search", unchanged - the underlying screen's content is
 * reworked in a later phase; this only changes what the tab is called
 * and its icon, matching the reference design's bottom-nav labeling and
 * the website's own "Explore" naming). Notifications moved to the top
 * app bar's bell icon plus the left drawer, per the approved redesign.
 *
 * Each tab carries a distinct outline (inactive) and filled (active)
 * icon - the single detail every reference mobile app uses to make a
 * selected tab actually read as selected, rather than only the
 * indicator pill doing that work. Create is the one exception: it's an
 * action button, not a persisted selection state, so it stays filled.
 */
enum class ZrpDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val isBottomBarItem: Boolean = true,
) {
    Home("home", R.string.nav_home, Icons.Filled.Home, Icons.Outlined.Home),
    Search("search", R.string.nav_explore, Icons.Filled.Explore, Icons.Outlined.Explore),
    Create("create", R.string.action_post, Icons.Filled.AddCircle, Icons.Filled.AddCircle),
    Notifications(
        "notifications",
        R.string.nav_notifications,
        Icons.Filled.Notifications,
        Icons.Outlined.Notifications,
        isBottomBarItem = false,
    ),
    Messages("messages", R.string.nav_messages, Icons.Filled.MailOutline, Icons.Outlined.MailOutline),
    Profile("profile", R.string.nav_profile, Icons.Filled.Person, Icons.Outlined.Person),
}
