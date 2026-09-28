package one.zrp.social.mobile.ui.home

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * [stripHtmlTags] is the plain-text fallback ArticleBody shows for an
 * ARTICLE post's rich-text `body` - see that composable's own KDoc for
 * why full HTML rendering isn't attempted. This is what previously
 * didn't exist at all: an ARTICLE (or RECRUITMENT) post from web
 * rendered on Android as bare `content` text with the rest silently
 * dropped, because the Android `Post` model had no `type`/`body`/
 * `company`/`location`/`applyUrl` fields to read in the first place.
 */
class PostTypeContentTest {

    @Test
    fun `strips simple tags leaving the inner text`() {
        assertEquals("Hello world", stripHtmlTags("<p>Hello <strong>world</strong></p>"))
    }

    @Test
    fun `converts br and block-closing tags to newlines`() {
        assertEquals("Line one\nLine two", stripHtmlTags("Line one<br>Line two"))
        assertEquals("First\n\nSecond", stripHtmlTags("<p>First</p><p>Second</p>"))
    }

    @Test
    fun `un-escapes the common HTML entities the rich-text editor emits`() {
        assertEquals(
            "Terms & Conditions: <this> is a \"test\" — it's fine",
            stripHtmlTags("Terms &amp; Conditions: &lt;this&gt; is a &quot;test&quot; — it&#39;s fine"),
        )
    }

    @Test
    fun `collapses runs of blank lines left behind by stripped block tags`() {
        val result = stripHtmlTags("<div></div><div></div><div></div>Text")
        assertEquals("Text", result)
    }

    @Test
    fun `empty input produces empty output rather than throwing`() {
        assertEquals("", stripHtmlTags(""))
    }

    @Test
    fun `plain text with no tags at all is returned unchanged`() {
        assertEquals("Just plain text.", stripHtmlTags("Just plain text."))
    }
}
