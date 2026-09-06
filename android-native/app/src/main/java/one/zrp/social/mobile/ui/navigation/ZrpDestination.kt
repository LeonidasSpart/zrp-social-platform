package one.zrp.social.mobile.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * The six bottom-navigation destinations for the ZRP mobile app -
 * deliberately not a copy of the website's header/sidebar nav (which
 * also lists Explore, News, Marketplace, Music, Play, Opportunity,
 * Aid, Bookmarks as top-level items). A phone's bottom bar only has
 * room for the core social loop; everything else becomes reachable
 * from within these screens as the later phases build them out,
 * exactly as X/Instagram surface search/discovery inside "Search"
 * rather than as separate bottom-nav tabs.
 *
 * Each tab carries a distinct outline (inactive) and filled (active)
 * icon - the single detail every reference mobile app uses to make a
 * selected tab actually read as selected, rather than only the
 * indicator pill doing that work. Create is the one exception: it's an
 * action button, not a persisted selection state, so it stays filled.
 */
enum class ZrpDestination(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
) {
    Home("home", "Home", Icons.Filled.Home, Icons.Outlined.Home),
    Search("search", "Search", Icons.Filled.Search, Icons.Outlined.Search),
    Create("create", "Post", Icons.Filled.AddCircle, Icons.Filled.AddCircle),
    Notifications("notifications", "Notifications", Icons.Filled.Notifications, Icons.Outlined.Notifications),
    Messages("messages", "Messages", Icons.Filled.MailOutline, Icons.Outlined.MailOutline),
    Profile("profile", "Profile", Icons.Filled.Person, Icons.Outlined.Person),
}
