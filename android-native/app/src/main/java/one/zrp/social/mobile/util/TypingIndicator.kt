package one.zrp.social.mobile.util

/**
 * Pure formatting logic for a group thread's "who's typing" line -
 * GROUP chat genuinely needs this (several people can be typing at
 * once), unlike 1:1's own single "Typing…" string. Kept as a plain,
 * non-Composable function (mirrors CallViewModel's own CallError KDoc
 * on why): a ViewModel/util function can't resolve Android string
 * resources itself, so only the *shape* of the decision - which of the
 * four cases, and which real names/count are involved - lives here;
 * GroupConversationScreen's own typingIndicatorText() turns that into
 * real, translated text.
 *
 * [typingNames] is the list of display names (never raw userIds) for
 * everyone other than the viewer currently typing, in a stable order
 * (GroupConversationViewModel's caller sorts by userId, matching how
 * `typingUserIds: Set<String>` has no other real ordering signal - not
 * "most recent first", a reasonable simplification for a value that's
 * usually 1-2 names anyway).
 */
sealed class TypingIndicator {
    object None : TypingIndicator()
    data class One(val name: String) : TypingIndicator()
    data class Two(val first: String, val second: String) : TypingIndicator()
    // "Alice, Bob and 3 others are typing…" - othersCount is always >= 1
    // here (Many is only ever reached once there are 3+ typers).
    data class Many(val first: String, val second: String, val othersCount: Int) : TypingIndicator()
}

fun formatTypingIndicator(typingNames: List<String>): TypingIndicator = when {
    typingNames.isEmpty() -> TypingIndicator.None
    typingNames.size == 1 -> TypingIndicator.One(typingNames[0])
    typingNames.size == 2 -> TypingIndicator.Two(typingNames[0], typingNames[1])
    else -> TypingIndicator.Many(typingNames[0], typingNames[1], typingNames.size - 2)
}
