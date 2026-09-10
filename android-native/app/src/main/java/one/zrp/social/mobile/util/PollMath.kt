package one.zrp.social.mobile.util

import one.zrp.social.mobile.network.PollVoteUser
import one.zrp.social.mobile.network.Post
import kotlin.math.roundToInt

/**
 * Poll vote-count math extracted from PollBlock/PollOptionRow
 * (PostCard.kt) so it is unit-testable without Compose, and hardened
 * against the malformed-data cases a poll can legitimately reach in
 * production (a vote miscount from a network race, a stale local
 * optimistic-update cache, a corrupted votes map) - none of these are
 * supposed to happen, but arithmetic on them must never produce a
 * NaN/Infinity/out-of-range fraction reaching
 * Modifier.fillMaxWidth(fraction = ...), which throws on exactly that
 * input and would take the whole app down over a single poll's result
 * bar. Reported symptom this hardens against: the app closing the
 * instant a poll option is tapped, with no crash-reporting SDK wired
 * up in this app to capture why (see this repo's own investigation
 * notes) - this closes off every malformed-input path into that
 * specific Compose precondition even though the exact trigger could
 * not be reproduced without a real device.
 */
fun pollOptionPercentage(count: Int, totalVotes: Int): Int {
    if (totalVotes <= 0) return 0
    val raw = (count.toFloat() * 100f) / totalVotes.toFloat()
    if (!raw.isFinite()) return 0
    return raw.roundToInt().coerceIn(0, 100)
}

fun pollOptionFraction(percentage: Int): Float {
    val fraction = percentage / 100f
    if (!fraction.isFinite()) return 0f
    return fraction.coerceIn(0f, 1f)
}

// Moved out of HomeViewModel so it is unit-testable on its own (a
// plain Post/Poll transform, no ViewModel/coroutine machinery needed) -
// see HomeViewModel.votePoll's own KDoc for why the caller wraps this
// in a try/catch regardless. The vote endpoint returns only
// {success: true} - no updated counts (see Poll's own KDoc) - so the
// +1 is applied locally here the same way HomeViewModel's own
// applyOptimisticLike bumps a like count, rather than refetching.
// Returns the post unchanged for any input this can't sensibly apply
// to (no poll, a negative optionIndex) instead of throwing.
fun applyOptimisticVote(post: Post, optionIndex: Int): Post {
    val poll = post.poll ?: return post
    if (optionIndex < 0) return post
    val key = optionIndex.toString()
    val newVotes = (poll.votes ?: emptyMap()) + (key to ((poll.votes?.get(key) ?: 0) + 1))
    return post.copy(poll = poll.copy(votes = newVotes, votes_user = listOf(PollVoteUser(optionIndex))))
}

// The client-side single-vote guard votePoll relies on before it ever
// touches network/state - matches Poll.tsx's own `if (selected !==
// null) return`, given the same postId can legitimately appear in more
// than one list (see votePoll's own comment).
fun hasAlreadyVotedOnPost(posts: List<Post>, postId: String): Boolean =
    posts.firstOrNull { it.id == postId }?.poll?.userVoteIndex != null
