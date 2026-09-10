package one.zrp.social.mobile.util

import one.zrp.social.mobile.network.Poll
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.PostCounts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the Android poll-voting crash report: "poll
 * displayed correctly, tap an option, the app closes". No crash log or
 * device was available to pin down the exact trigger (see this repo's
 * own investigation notes on android-native-build.yml / PollMath.kt),
 * so this instead proves every malformed/edge-case input this review
 * could construct never produces a value Compose's
 * Modifier.fillMaxWidth(fraction = ...) rejects (NaN, Infinity, or
 * outside [0, 1]), and that the optimistic vote-application never
 * throws on data shapes this review could imagine (a poll option count
 * exceeding the total, a poll with no votes map yet, a negative or
 * out-of-range option index).
 */
class PollMathTest {

    // ---- pollOptionPercentage ----

    @Test
    fun `zero total votes yields zero percent`() {
        assertEquals(0, pollOptionPercentage(count = 0, totalVotes = 0))
        assertEquals(0, pollOptionPercentage(count = 5, totalVotes = 0))
    }

    @Test
    fun `negative total votes yields zero percent instead of throwing`() {
        assertEquals(0, pollOptionPercentage(count = 3, totalVotes = -1))
    }

    @Test
    fun `normal vote counts compute expected percentage`() {
        assertEquals(50, pollOptionPercentage(count = 1, totalVotes = 2))
        assertEquals(100, pollOptionPercentage(count = 2, totalVotes = 2))
        assertEquals(33, pollOptionPercentage(count = 1, totalVotes = 3))
    }

    @Test
    fun `count exceeding total votes is clamped to 100 not left unbounded`() {
        // Should never happen from a correct backend, but a stale local
        // optimistic-update cache could produce it transiently - this
        // must clamp, not hand Compose a fraction above 1.
        assertEquals(100, pollOptionPercentage(count = 50, totalVotes = 2))
    }

    // ---- pollOptionFraction ----

    @Test
    fun `fraction stays within the 0 to 1 range Compose requires`() {
        assertEquals(0f, pollOptionFraction(-10), 0.0001f)
        assertEquals(0f, pollOptionFraction(0), 0.0001f)
        assertEquals(0.5f, pollOptionFraction(50), 0.0001f)
        assertEquals(1f, pollOptionFraction(100), 0.0001f)
        assertEquals(1f, pollOptionFraction(250), 0.0001f)
    }

    // ---- applyOptimisticVote ----

    private fun samplePost(poll: Poll?): Post = Post(
        id = "post-1",
        content = "A dohet ndryshuar diqka ne ZRP?",
        imageUrl = null,
        imageUrls = null,
        mediaType = null,
        createdAt = "2026-09-10T09:00:00.000Z",
        author = PostAuthor(id = "author-1", username = "royal", name = "Pajtim Dalipi", avatarUrl = null, badgeType = null),
        quotePost = null,
        _count = PostCounts(likes = 1, comments = 0, reposts = 0),
        liked = false,
        poll = poll,
    )

    private fun samplePoll(
        options: List<String> = listOf("Po", "Jo"),
        votes: Map<String, Int>? = null,
    ): Poll = Poll(
        id = "poll-1",
        question = "A dohet ndryshuar diqka ne ZRP?",
        options = options,
        votes = votes,
        expiresAt = null,
        createdAt = "2026-09-10T09:00:00.000Z",
        updatedAt = "2026-09-10T09:00:00.000Z",
        votes_user = null,
    )

    @Test
    fun `voting on a fresh poll with no votes map yet adds the first vote`() {
        val post = samplePost(samplePoll(votes = null))

        val result = applyOptimisticVote(post, optionIndex = 0)

        assertEquals(1, result.poll!!.voteCount(0))
        assertEquals(0, result.poll!!.voteCount(1))
        assertEquals(1, result.poll!!.totalVotes())
        assertEquals(0, result.poll!!.userVoteIndex)
    }

    @Test
    fun `voting increments the existing count for that option only`() {
        val post = samplePost(samplePoll(votes = mapOf("0" to 3, "1" to 1)))

        val result = applyOptimisticVote(post, optionIndex = 1)

        assertEquals(3, result.poll!!.voteCount(0))
        assertEquals(2, result.poll!!.voteCount(1))
        assertEquals(5, result.poll!!.totalVotes())
    }

    @Test
    fun `a post with no poll is returned unchanged rather than throwing`() {
        val post = samplePost(poll = null)

        val result = applyOptimisticVote(post, optionIndex = 0)

        assertEquals(post, result)
    }

    @Test
    fun `a negative option index is a no-op rather than corrupting the votes map`() {
        val post = samplePost(samplePoll(votes = mapOf("0" to 1)))

        val result = applyOptimisticVote(post, optionIndex = -1)

        assertEquals(post, result)
    }

    @Test
    fun `voting for an option index beyond the options list still updates without throwing`() {
        // Stale client cache vs a poll that was edited server-side is
        // not supposed to happen, but this proves it degrades to a
        // no-crash extra map entry rather than an exception.
        val post = samplePost(samplePoll(options = listOf("Po", "Jo"), votes = null))

        val result = applyOptimisticVote(post, optionIndex = 5)

        assertEquals(1, result.poll!!.voteCount(5))
        assertEquals(5, result.poll!!.userVoteIndex)
    }

    // ---- hasAlreadyVotedOnPost ----

    @Test
    fun `hasAlreadyVotedOnPost is false for a poll with no recorded vote`() {
        val posts = listOf(samplePost(samplePoll()))
        assertFalse(hasAlreadyVotedOnPost(posts, "post-1"))
    }

    @Test
    fun `hasAlreadyVotedOnPost is true once a vote has been applied`() {
        val voted = applyOptimisticVote(samplePost(samplePoll()), optionIndex = 0)
        assertTrue(hasAlreadyVotedOnPost(listOf(voted), "post-1"))
    }

    @Test
    fun `hasAlreadyVotedOnPost is false for an unknown postId instead of throwing`() {
        val posts = listOf(samplePost(samplePoll()))
        assertFalse(hasAlreadyVotedOnPost(posts, "does-not-exist"))
    }
}
