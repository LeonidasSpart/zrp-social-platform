package one.zrp.social.mobile

import android.app.Application
import one.zrp.social.mobile.network.ApiClient

class ZrpApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
    }
}
