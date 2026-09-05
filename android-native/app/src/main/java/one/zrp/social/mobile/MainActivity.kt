package one.zrp.social.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import one.zrp.social.mobile.ui.navigation.ZrpNavHost
import one.zrp.social.mobile.ui.theme.ZrpSocialTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ZrpSocialApp()
        }
    }
}

@Composable
fun ZrpSocialApp() {
    ZrpSocialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            ZrpNavHost()
        }
    }
}
