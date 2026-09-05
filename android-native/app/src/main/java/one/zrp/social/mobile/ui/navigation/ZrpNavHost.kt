package one.zrp.social.mobile.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import one.zrp.social.mobile.ui.home.HomeScreen
import one.zrp.social.mobile.ui.profile.ProfileScreen
import one.zrp.social.mobile.ui.screens.CreateScreen
import one.zrp.social.mobile.ui.screens.MessagesScreen
import one.zrp.social.mobile.ui.screens.NotificationsScreen
import one.zrp.social.mobile.ui.search.SearchScreen

@Composable
fun ZrpNavHost(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val goToProfile: (String) -> Unit = { username -> navController.navigate("profile/$username") }

    Scaffold(
        bottomBar = { ZrpBottomBar(navController) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = ZrpDestination.Home.route,
            modifier = androidx.compose.ui.Modifier.padding(innerPadding),
        ) {
            composable(ZrpDestination.Home.route) { HomeScreen(onAuthorClick = goToProfile) }
            composable(ZrpDestination.Search.route) { SearchScreen(onAuthorClick = goToProfile) }
            composable(ZrpDestination.Create.route) { CreateScreen() }
            composable(ZrpDestination.Notifications.route) { NotificationsScreen() }
            composable(ZrpDestination.Messages.route) { MessagesScreen() }
            composable(ZrpDestination.Profile.route) {
                ProfileScreen(username = null, onLogout = onLogout, onAuthorClick = goToProfile)
            }
            composable(
                route = "profile/{username}",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                ProfileScreen(username = username, onLogout = onLogout, onAuthorClick = goToProfile)
            }
        }
    }
}

@Composable
private fun ZrpBottomBar(navController: androidx.navigation.NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    NavigationBar {
        ZrpDestination.entries.forEach { destination ->
            val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true

            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(destination.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = { Icon(destination.icon, contentDescription = destination.label) },
                label = { Text(destination.label) },
            )
        }
    }
}
