package one.zrp.social.mobile.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Source-scan regression gate (same shape as ComposerInvariantsTest and
 * LocalizationCompletenessTest: a plain JVM test reading the real Kotlin
 * sources off disk) for the front-end fix mission's native items, all of
 * which the compiler cannot see:
 *
 *  A. A refused repost is explained (HomeViewModel/ProfileViewModel
 *     classify the failure; the screens show it), and zrp.one links
 *     tapped in content (a post shared into a DM) route in-app through
 *     LocalInAppLinkHandler instead of a bare ACTION_VIEW intent.
 *  B. The shared ImageLightbox (profile avatar/banner, post media,
 *     message attachments) has pinch zoom, real loading/error states,
 *     a 48dp close target and respects safeDrawing insets.
 *  C. Screens hosted inside ZrpNavHost's Scaffold (Stories, Shorts) never
 *     add statusBarsPadding()/navigationBarsPadding() on top of the
 *     Scaffold's innerPadding (design-system §6, trap 2).
 *  D. Every password field has a show/hide toggle.
 *  E. Back arrows in the settings/music/shorts screens are auto-mirrored
 *     for RTL (Arabic).
 *  F. Appearance offers the System option and no English-only literal.
 *  G. The music mini player lives once, in ZrpNavHost's Scaffold, and its
 *     dismissal is reversible.
 */
class FrontendFixInvariantsTest {

    private val uiDir: File = run {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var found: File? = null
        repeat(6) {
            val candidate = File(dir, "src/main/java/one/zrp/social/mobile/ui")
            if (File(candidate, "navigation/ZrpNavHost.kt").exists()) {
                found = candidate
            }
            dir = dir.parentFile ?: dir
        }
        found ?: throw IllegalStateException(
            "Could not locate src/main/java/one/zrp/social/mobile/ui from working directory " +
                (System.getProperty("user.dir") ?: "?")
        )
    }

    private fun source(relative: String): String {
        val file = File(uiDir, relative)
        assertTrue("Expected source file to exist: $relative", file.exists())
        return file.readText()
    }

    private fun String.count(needle: String): Int = windowed(needle.length).count { it == needle }

    /** The file with `//` line comments and block comments removed, so prose never counts as code. */
    private fun String.codeOnly(): String =
        replace(Regex("/\\*.*?\\*/", RegexOption.DOT_MATCHES_ALL), "")
            .lines()
            .filterNot { it.trimStart().startsWith("//") }
            .joinToString("\n")

    @Test
    fun refusedRepostIsClassifiedAndShown() {
        listOf("home/HomeViewModel.kt", "profile/ProfileViewModel.kt").forEach { path ->
            val src = source(path)
            assertTrue("$path must classify a failed repost via toRepostFailure()", src.contains("toRepostFailure()"))
            assertTrue("$path must expose repostFailure for the screen", src.contains("val repostFailure: StateFlow<RepostFailure?>"))
        }
        listOf("home/HomeScreen.kt", "profile/ProfileScreen.kt").forEach { path ->
            val src = source(path)
            assertTrue("$path must resolve the failure to a translated message", src.contains("repostFailureMessage("))
            assertTrue("$path must show the failure in a SnackbarHost", src.contains("SnackbarHost("))
        }
        val feedback = source("components/RepostFeedback.kt")
        assertTrue(feedback.contains("R.string.post_repost_private_error"))
        assertTrue(feedback.contains("http.code() != 403"))
    }

    @Test
    fun zrpLinksInContentRouteInApp() {
        listOf("components/LinkifiedText.kt", "components/LinkPreviewBlock.kt").forEach { path ->
            val src = source(path)
            assertTrue("$path must open URLs through openLink()", src.contains("openLink(context, inAppLinkHandler,"))
            assertFalse("$path must not fire a bare ACTION_VIEW intent", src.contains("Intent.ACTION_VIEW"))
        }
        val nav = source("navigation/ZrpNavHost.kt")
        assertTrue("ZrpNavHost must provide the in-app link handler", nav.contains("LocalInAppLinkHandler provides"))
        assertTrue("The handler must resolve against the graph's real deep links", nav.contains("navController.graph.hasDeepLink(uri)"))
        assertTrue("Post detail must be reachable by its zrp.one deep link", nav.contains("uriPattern = \"https://zrp.one/post/{postId}"))
    }

    @Test
    fun imageLightboxZoomsAndHasLoadingAndErrorStates() {
        val src = source("components/ImageLightbox.kt")
        assertTrue("Lightbox must support pinch zoom", src.contains("calculateZoom()"))
        assertTrue("Lightbox must support double-tap zoom", src.contains("onDoubleTap"))
        assertTrue("Lightbox must show a loading state", src.contains("AsyncImagePainter.State.Loading"))
        assertTrue("Lightbox must show a translated error state", src.contains("R.string.image_viewer_load_failed"))
        assertTrue("Lightbox error state must offer Retry", src.contains("R.string.action_retry"))
        assertTrue("Lightbox close button must meet the 48dp floor", src.contains("IconButton(onClick = onDismiss, modifier = Modifier.size(TouchTarget.min))"))
        assertTrue("Edge-to-edge lightbox chrome must respect safeDrawing insets", src.contains("windowInsetsPadding(WindowInsets.safeDrawing)"))
        assertTrue("Lightbox must not close on the tap that ends a pinch", src.contains("if (scale <= MIN_SCALE) onTapAtRest()"))
        // Every viewer surface still goes through the one shared component.
        listOf("profile/ProfileScreen.kt", "home/PostCard.kt").forEach { path ->
            assertTrue("$path must open images with the shared ImageLightbox", source(path).contains("ImageLightbox("))
        }
    }

    @Test
    fun scaffoldHostedFullScreenViewersDoNotDoubleCountInsets() {
        listOf("stories/StoryViewerScreen.kt", "shorts/ShortsScreen.kt").forEach { path ->
            // codeOnly(): both files explain the omission in a comment
            // that names the very method it's describing the absence of
            // ("No statusBarsPadding() ..."), which a raw contains()
            // check can't tell apart from the method actually being called.
            val src = source(path).codeOnly()
            assertFalse("$path must not add statusBarsPadding() on top of the Scaffold inset", src.contains("statusBarsPadding()"))
            assertFalse("$path must not add navigationBarsPadding() on top of the Scaffold inset", src.contains("navigationBarsPadding()"))
        }
        val story = source("stories/StoryViewerScreen.kt")
        assertTrue("Story close button must meet the 48dp floor", story.contains("IconButton(onClick = onClose, modifier = Modifier.size(TouchTarget.min))"))
    }

    @Test
    fun everyPasswordFieldHasAShowHideToggle() {
        listOf(
            "auth/LoginScreen.kt",
            "auth/SignupScreen.kt",
            "settings/SecuritySettingsScreen.kt",
            "settings/AccountSettingsScreen.kt",
        ).forEach { path ->
            val src = source(path).codeOnly()
            val fields = src.count("PasswordVisualTransformation()")
            assertTrue("$path should contain at least one password field", fields > 0)
            assertEquals(
                "$path: every PasswordVisualTransformation() needs a matching show/hide toggle",
                fields,
                src.count("R.string.action_show_password"),
            )
            assertTrue("$path toggle must also announce Hide password", src.contains("R.string.action_hide_password"))
        }
        // New and Confirm on the change-password form toggle independently:
        // the shared field owns its own `visible` state per instance.
        val security = source("settings/SecuritySettingsScreen.kt").codeOnly()
        assertTrue(security.contains("var visible by remember { mutableStateOf(false) }"))
        // Current, New and Confirm: three call sites plus the one definition.
        assertEquals(4, security.count("PasswordField("))
    }

    @Test
    fun backArrowsInOwnedScreensAreAutoMirroredForRtl() {
        listOf("settings", "music", "shorts").forEach { dir ->
            File(uiDir, dir).listFiles { f -> f.extension == "kt" }!!.forEach { file ->
                assertFalse(
                    "${file.name} must use Icons.AutoMirrored.Filled.ArrowBack so the back arrow mirrors in RTL",
                    file.readText().contains("Icons.Filled.ArrowBack"),
                )
            }
        }
    }

    @Test
    fun appearanceOffersSystemAndIsTranslated() {
        val appearance = source("settings/AppearanceSettingsScreen.kt")
        assertTrue("Appearance must offer a System (follow device) option", appearance.contains("R.string.settings_theme_system"))
        assertTrue("Choosing System must clear the stored override", appearance.contains("store.clear()"))
        assertTrue("Appearance title must be a string resource", appearance.contains("R.string.settings_appearance_title"))
        assertFalse("Settings row must not carry the English-only literal", source("settings/SettingsScreen.kt").contains("label = \"Appearance\""))
        val language = source("settings/LanguageSettingsScreen.kt")
        assertTrue("Language list must be a LazyColumn (scrollable, all 29 reachable)", language.contains("LazyColumn("))
        assertTrue("Language rows must be selectable radio-style items", language.contains("role = Role.RadioButton"))
    }

    @Test
    fun miniPlayerIsHoistedOnceAndDismissIsReversible() {
        val nav = source("navigation/ZrpNavHost.kt")
        assertTrue("ZrpNavHost must render the persistent MiniPlayerBar", nav.contains("MiniPlayerBar("))
        assertTrue("Dismissing the bar must offer Show player right away", nav.contains("R.string.music_show_player"))
        assertTrue(nav.contains("musicPlayerViewModel.showPlayer()"))
        // MusicScreen defines the bar but no longer renders its own copy.
        assertEquals(1, source("music/MusicScreen.kt").codeOnly().count("MiniPlayerBar("))
        assertEquals(0, source("music/MusicQueueScreen.kt").codeOnly().count("MiniPlayerBar("))
        val player = source("music/MusicPlayerViewModel.kt")
        assertTrue("MusicPlayerViewModel must expose showPlayer()", player.contains("fun showPlayer()"))
        // dismissPlayer() must stay a pure hide - no queue wipe, no stop.
        val dismissBody = player.substringAfter("fun dismissPlayer() {").substringBefore("}")
        assertFalse(dismissBody.contains("queue"))
        assertTrue(dismissBody.contains("dismissed = true"))
    }
}
