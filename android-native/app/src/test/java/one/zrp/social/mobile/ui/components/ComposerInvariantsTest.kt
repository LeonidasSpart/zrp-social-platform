package one.zrp.social.mobile.ui.components

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Source-scan regression gate for the composer / copy-text fixes, in
 * the same spirit as LocalizationCompletenessTest: a plain JVM test that
 * reads the real Kotlin sources off disk, because the defects it guards
 * were all invisible to the compiler.
 *
 *  1. Every free-text composer the app ships (DM 1:1, DM group, comment
 *     on the comments screen and on post detail, post composer, Shorts
 *     caption) renders through [ZrpComposerField], which sets the typed
 *     text colour, cursor and placeholder explicitly instead of
 *     inheriting whatever content colour is in scope. "I'm typing but I
 *     can't see the text" must not come back via a stray
 *     OutlinedTextField with inherited colours.
 *  2. The post composer scrolls and its text field is not a weighted
 *     child: a weight(1f) field under an attached media preview and an
 *     open keyboard collapsed to zero height, hiding the typed text.
 *  3. LinkifiedText does not use foundation's ClickableText, which
 *     swallowed long-presses on message text so Copy was unreachable,
 *     and every message bubble routes the text's long-press to its
 *     actions menu.
 *  4. Composer screens never add navigationBarsPadding() on top of the
 *     Scaffold inset ZrpNavHost already applies (design-system trap 2).
 */
class ComposerInvariantsTest {

    private val uiDir: File = run {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var found: File? = null
        repeat(6) {
            val candidate = File(dir, "src/main/java/one/zrp/social/mobile/ui")
            if (File(candidate, "components/ZrpComposer.kt").exists()) {
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

    private val composerScreens = listOf(
        "messages/ConversationScreen.kt",
        "messages/GroupConversationScreen.kt",
        "comments/CommentsScreen.kt",
        "postdetail/PostDetailScreen.kt",
        "create/CreatePostScreen.kt",
        "shorts/ShortsUploadDialog.kt",
    )

    @Test
    fun everyComposerUsesTheSharedFieldWithExplicitColours() {
        composerScreens.forEach { path ->
            val src = source(path)
            assertTrue("$path must render its composer through ZrpComposerField", src.contains("ZrpComposerField("))
        }
        val field = source("components/ZrpComposer.kt")
        assertTrue("ZrpComposerField must set the typed text colour explicitly", field.contains("textStyle.copy(color ="))
        assertTrue("ZrpComposerField must set an explicit cursor brush", field.contains("cursorBrush = SolidColor(ZrpRed)"))
    }

    @Test
    fun draftFieldsDoNotFallBackToOutlinedTextField() {
        // The DM, comment and Shorts screens have exactly one free-text
        // composer each; none of them may regress to OutlinedTextField.
        listOf(
            "messages/ConversationScreen.kt",
            "messages/GroupConversationScreen.kt",
            "comments/CommentsScreen.kt",
            "postdetail/PostDetailScreen.kt",
            "shorts/ShortsUploadDialog.kt",
        ).forEach { path ->
            assertFalse("$path composer must not be an OutlinedTextField", source(path).contains("OutlinedTextField("))
        }
    }

    @Test
    fun postComposerScrollsAndIsNotAWeightedField() {
        val src = source("create/CreatePostScreen.kt")
        assertTrue("CreatePostScreen root column must scroll", src.contains(".verticalScroll(rememberScrollState())"))
        val fieldStart = src.indexOf("ZrpComposerField(")
        assertTrue(fieldStart >= 0)
        val fieldBlock = src.substring(fieldStart, src.indexOf("\n        )\n", fieldStart))
        assertFalse("The post text field must not be a weight(1f) child (it collapsed under the keyboard)", fieldBlock.contains(".weight("))
        assertTrue("The post text field must reserve a real minimum height", fieldBlock.contains("minLines ="))
    }

    @Test
    fun shortsCaptionDialogScrolls() {
        val src = source("shorts/ShortsUploadDialog.kt")
        assertTrue("ShortsUploadDialog content column must scroll so the caption stays reachable above the keyboard", src.contains(".verticalScroll(rememberScrollState())"))
    }

    @Test
    fun linkifiedTextSupportsLongPressAndBubblesUseIt() {
        val linkified = source("components/LinkifiedText.kt")
        assertFalse("LinkifiedText must not use ClickableText (it swallows long-presses)", linkified.contains("ClickableText("))
        assertTrue("LinkifiedText must expose onLongClick", linkified.contains("onLongClick: (() -> Unit)? = null"))
        assertTrue("LinkifiedText must wire onLongClick into its tap detector", linkified.contains("onLongPress = onLongClick"))

        listOf("messages/ConversationScreen.kt", "messages/GroupConversationScreen.kt").forEach { path ->
            val src = source(path)
            assertTrue("$path bubble text must open the actions menu on long-press", src.contains("onLongClick = { menuOpen = true }"))
            assertTrue("$path actions menu must offer Copy", src.contains("R.string.action_copy"))
            assertTrue("$path must copy via the shared clipboard helper", src.contains("copyTextWithFeedback("))
        }
        val comments = source("comments/CommentsScreen.kt")
        assertTrue("Comment text must offer Copy on long-press", comments.contains("onLongClick = { textMenuOpen = true }"))
    }

    @Test
    fun composerScreensDoNotDoubleCountTheNavigationBarInset() {
        composerScreens.forEach { path ->
            val src = source(path).lines().filterNot { it.trimStart().startsWith("//") }.joinToString("\n")
            assertFalse("$path must not add navigationBarsPadding() on top of the Scaffold inset", src.contains("navigationBarsPadding()"))
        }
    }
}
