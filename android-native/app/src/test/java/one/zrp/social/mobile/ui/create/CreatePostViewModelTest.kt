package one.zrp.social.mobile.ui.create

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the "no way to create a recruitment/article
 * post on Android" gap: the app could already render Post.type ==
 * RECRUITMENT/ARTICLE (see PostTypeContentTest.kt), but had no composer
 * UI to make one - only the web app could. isCreatePostSubmitBlocked/
 * resolveCreatePostContent are pure ports of PostComposer.tsx's own
 * isSubmitDisabled/submit-payload content fallback, so the exact same
 * gating logic is directly testable here.
 */
class CreatePostViewModelTest {

    private fun blocked(
        content: String = "hello",
        hasMedia: Boolean = false,
        hasPoll: Boolean = false,
        isPollValid: Boolean = true,
        isScheduling: Boolean = false,
        hasScheduledAt: Boolean = false,
        postType: PostCreationType = PostCreationType.POST,
        company: String = "",
        articleBody: String = "",
        isPosting: Boolean = false,
        isUploading: Boolean = false,
    ) = isCreatePostSubmitBlocked(
        content = content,
        hasMedia = hasMedia,
        hasPoll = hasPoll,
        isPollValid = isPollValid,
        isScheduling = isScheduling,
        hasScheduledAt = hasScheduledAt,
        postType = postType,
        company = company,
        articleBody = articleBody,
        isPosting = isPosting,
        isUploading = isUploading,
    )

    @Test
    fun `a plain post with real text is never blocked`() {
        assertFalse(blocked(content = "hello"))
    }

    @Test
    fun `an empty plain post with no media and no poll is blocked`() {
        assertFalse(blocked(content = "x")) // sanity: real content isn't blocked
        assertTrue(blocked(content = "", hasMedia = false, hasPoll = false))
    }

    @Test
    fun `an empty plain post is not blocked once media is attached`() {
        assertFalse(blocked(content = "", hasMedia = true))
    }

    @Test
    fun `an empty article with no title is NOT blocked by the empty-content rule`() {
        // Unlike POST/RECRUITMENT, an ARTICLE's title is always optional -
        // it's still blocked below by the separate articleBody-required
        // rule, just not by this one.
        assertTrue(blocked(content = "", postType = PostCreationType.ARTICLE, articleBody = ""))
        assertFalse(blocked(content = "", postType = PostCreationType.ARTICLE, articleBody = "real body"))
    }

    @Test
    fun `a recruitment post without a company name is blocked`() {
        assertTrue(blocked(content = "job description", postType = PostCreationType.RECRUITMENT, company = ""))
        assertTrue(blocked(content = "job description", postType = PostCreationType.RECRUITMENT, company = "   "))
    }

    @Test
    fun `a recruitment post with a company name is not blocked`() {
        assertFalse(blocked(content = "job description", postType = PostCreationType.RECRUITMENT, company = "Acme"))
    }

    @Test
    fun `an article without body text is blocked even with a title`() {
        assertTrue(blocked(content = "My title", postType = PostCreationType.ARTICLE, articleBody = ""))
    }

    @Test
    fun `an article with real body text is not blocked`() {
        assertFalse(blocked(content = "", postType = PostCreationType.ARTICLE, articleBody = "Real article content"))
    }

    @Test
    fun `scheduling on without a picked time blocks submit`() {
        assertTrue(blocked(isScheduling = true, hasScheduledAt = false))
        assertFalse(blocked(isScheduling = true, hasScheduledAt = true))
    }

    @Test
    fun `an open poll with fewer than 2 real options blocks submit`() {
        assertTrue(blocked(content = "", hasPoll = true, isPollValid = false))
        assertFalse(blocked(content = "", hasPoll = true, isPollValid = true))
    }

    @Test
    fun `already posting or uploading always blocks a second submit`() {
        assertTrue(blocked(isPosting = true))
        assertTrue(blocked(isUploading = true))
    }

    @Test
    fun `an article's content never falls back to the poll question`() {
        assertEquals("", resolveCreatePostContent("", "what should we build next", PostCreationType.ARTICLE))
        assertEquals("My title", resolveCreatePostContent("My title", "what should we build next", PostCreationType.ARTICLE))
    }

    @Test
    fun `a plain post's empty content falls back to the poll question`() {
        assertEquals("what should we build next", resolveCreatePostContent("", "what should we build next", PostCreationType.POST))
    }

    @Test
    fun `a plain post's real content is never replaced by the poll question`() {
        assertEquals("hello", resolveCreatePostContent("hello", "what should we build next", PostCreationType.POST))
    }
}
