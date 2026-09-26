package one.zrp.social.mobile.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.compositionLocalOf

/**
 * Routes a tapped URL to an in-app destination when one exists.
 *
 * Provided by ZrpNavHost (the one place that owns the NavController):
 * it returns true when the URL matched one of the graph's registered
 * `https://zrp.one/...` deep links (post, profile, hashtag, messages,
 * ...) and navigation happened, false otherwise. The default (no
 * provider - e.g. a logged-out surface or a preview) never claims a
 * link.
 *
 * Why this exists: a post shared into a DM arrives as a plain
 * `https://zrp.one/post/<id>` URL (see PostCard's Send in Message),
 * rendered by LinkifiedText + LinkPreviewBlock. Both used to fire a
 * bare ACTION_VIEW intent for every URL, which for the app's own
 * domain either bounced through Android's app-link resolver into a
 * second MainActivity task or, on a device where the App Link isn't
 * verified, opened the browser - so tapping a shared post inside the
 * app didn't open that post inside the app. The message bubble itself
 * doesn't need to know any of this: it keeps passing plain URLs.
 */
val LocalInAppLinkHandler = compositionLocalOf<(Uri) -> Boolean> { { false } }

/**
 * Opens [href]: in-app via [inAppHandler] when the graph knows the URL,
 * otherwise in the device's default browser. A device with no browser
 * (a kiosk/work profile) is a no-op rather than a crash.
 */
fun openLink(context: Context, inAppHandler: (Uri) -> Boolean, href: String) {
    val uri = Uri.parse(href)
    if (inAppHandler(uri)) return
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (_: ActivityNotFoundException) {
        // Nothing can handle it; leave the text as it was.
    }
}
