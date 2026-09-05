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
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import one.zrp.social.mobile.ui.screens.CreateScreen
import one.zrp.social.mobile.ui.screens.HomeScreen
import one.zrp.social.mobile.ui.screens.MessagesScreen
import one.zrp.social.mobile.ui.screens.NotificationsScreen
import one.zrp.social.mobile.ui.screens.ProfileScreen
import one.zrp.social.mobile.ui.screens.SearchScreen

@Composable
fun ZrpNavHost() {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = { ZrpBottomBar(navController) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = ZrpDestination.Home.route,
            modifier = androidx.compose.ui.Modifier.padding(innerPadding),
        ) {
            composable(ZrpDestination.Home.route) { HomeScreen() }
            composable(ZrpDestination.Search.route) { SearchScreen() }
            composable(ZrpDestination.Create.route) { CreateScreen() }
            composable(ZrpDestination.Notifications.route) { NotificationsScreen() }
            composable(ZrpDestination.Messages.route) { MessagesScreen() }
            composable(ZrpDestination.Profile.route) { ProfileScreen() }
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
