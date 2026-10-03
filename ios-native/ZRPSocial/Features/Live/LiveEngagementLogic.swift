import Foundation

// Pure state machines behind the live engagement layer, kept free of
// SwiftUI, networking and timers so each one is unit-tested directly
// (`ZRPSocialTests/LiveEngagementLogicTests.swift`). The view model owns
// the clocks and the I/O; these own the rules.

// MARK: - Reactions

/// Batches rapid reaction taps into one `POST .../reactions {count}`
/// rather than one request per tap.
///
/// - At most `maxPerRequest` taps go in one request - the server's own
///   `MAX_TAPS_PER_REQUEST` (20); anything above that would be silently
///   truncated server-side and the count would drift.
/// - Once the server answers `rate_limited`, taps stop counting locally
///   until `retryAfter` has passed. Reactions are a casual, low-stakes
///   action, so this is silent - no error toast - and the taps made
///   while paused are dropped rather than queued, because queuing them
///   would only replay the same rejection.
struct LiveReactionBatcher: Equatable {

    static let maxPerRequest = 20

    private(set) var pending = 0
    private(set) var pausedUntil: Date?

    /// Records one tap. Returns `false` (and records nothing) while
    /// paused, so the caller skips its local animation too.
    mutating func tap(now: Date) -> Bool {
        if let pausedUntil, now < pausedUntil { return false }
        pausedUntil = nil
        pending += 1
        return true
    }

    /// True once a full batch is waiting - flush now rather than waiting
    /// out the debounce.
    var isFull: Bool { pending >= Self.maxPerRequest }

    /// Takes the next batch to send, or `nil` when nothing is waiting.
    mutating func takeBatch() -> Int? {
        guard pending > 0 else { return nil }
        let batch = min(pending, Self.maxPerRequest)
        pending -= batch
        return batch
    }

    /// The server rate-limited a batch. Everything still waiting is
    /// dropped along with it.
    mutating func pause(now: Date, retryAfter: Double?) {
        pending = 0
        pausedUntil = now.addingTimeInterval(max(1, retryAfter ?? 5))
    }
}

/// How many floating particles a reaction burst draws. Proportional to
/// `count`, but capped, so a 20-tap batch from someone else animates as
/// a visibly bigger burst without instantiating twenty views.
func liveReactionParticleCount(for count: Int, cap: Int = 6) -> Int {
    max(1, min(count, cap))
}

// MARK: - Gift animation queue

/// One gift on screen (or waiting for its turn).
struct LiveGiftBanner: Identifiable, Equatable {
    let id: String
    let senderId: String
    let giftKey: String
    var quantity: Int
    /// Bumped whenever another identical gift is folded into this one, so
    /// the view can re-trigger its "pop" and the view model can restart
    /// its expiry timer.
    var generation: Int = 0
}

/// Decides which gift banners are on screen.
///
/// Gifts arrive in bursts - one person tapping Send repeatedly, or a
/// whole room reacting at once - and every viewer, not only the sender,
/// animates each one (`live-gift:sent` is broadcast room-wide). Showing
/// every event as its own banner would bury the stage, so:
///
/// - at most `maxVisible` banners are on screen at once;
/// - the same sender sending the same gift again is folded into their
///   existing banner (visible or queued) as a higher quantity, the way a
///   combo counter works;
/// - the waiting queue is bounded; when it overflows, the oldest waiting
///   banner is dropped - an animation is a courtesy, never a backlog the
///   room has to sit through.
///
/// Nothing here can block video rendering: the layer that draws this is
/// hit-testing-disabled and independent of the camera tiles.
struct LiveGiftQueue: Equatable {

    let maxVisible: Int
    let maxPending: Int

    private(set) var visible: [LiveGiftBanner] = []
    private(set) var pending: [LiveGiftBanner] = []

    init(maxVisible: Int = 2, maxPending: Int = 20) {
        self.maxVisible = maxVisible
        self.maxPending = maxPending
    }

    enum Outcome: Equatable {
        /// A new banner went on screen.
        case shown(id: String)
        /// Folded into the banner already on screen with this id.
        case merged(id: String)
        /// Waiting for a slot.
        case queued
    }

    @discardableResult
    mutating func enqueue(_ banner: LiveGiftBanner) -> Outcome {
        if let index = visible.firstIndex(where: { $0.senderId == banner.senderId && $0.giftKey == banner.giftKey }) {
            visible[index].quantity += banner.quantity
            visible[index].generation += 1
            return .merged(id: visible[index].id)
        }
        if let index = pending.lastIndex(where: { $0.senderId == banner.senderId && $0.giftKey == banner.giftKey }) {
            pending[index].quantity += banner.quantity
            return .queued
        }
        if visible.count < maxVisible {
            visible.append(banner)
            return .shown(id: banner.id)
        }
        pending.append(banner)
        if pending.count > maxPending {
            pending.removeFirst(pending.count - maxPending)
        }
        return .queued
    }

    /// Takes a banner off screen - but only if it has not been merged
    /// into since the expiry was scheduled (`generation`), so a combo
    /// that is still growing stays up. Returns the banner promoted into
    /// the freed slot, if any.
    @discardableResult
    mutating func expire(id: String, generation: Int) -> LiveGiftBanner? {
        guard let index = visible.firstIndex(where: { $0.id == id }), visible[index].generation == generation else {
            return nil
        }
        visible.remove(at: index)
        guard !pending.isEmpty, visible.count < maxVisible else { return nil }
        let next = pending.removeFirst()
        visible.append(next)
        return next
    }

    mutating func removeAll() {
        visible.removeAll()
        pending.removeAll()
    }
}

// MARK: - Chat

/// Merges incoming chat rows into the existing list: deduplicated by id
/// (a sender sees their own message both from the `POST` response and
/// from the `live-chat:message` broadcast), oldest first, and keeping an
/// `author` already known for a row when the incoming copy lacks one.
func mergeLiveChatMessages(_ existing: [LiveChatMessage], _ incoming: [LiveChatMessage]) -> [LiveChatMessage] {
    var byId: [String: LiveChatMessage] = [:]
    for message in existing { byId[message.id] = message }
    for message in incoming {
        if let current = byId[message.id], message.author == nil, current.author != nil {
            continue
        }
        byId[message.id] = message
    }
    return byId.values.sorted { lhs, rhs in
        if lhs.createdAt != rhs.createdAt { return lhs.createdAt < rhs.createdAt }
        return lhs.id < rhs.id
    }
}

/// The cap on messages kept in memory for one room. A long room keeps
/// the newest; older ones are a "Load more" away.
let liveChatMemoryCap = 300

/// Trims to the newest `cap` messages.
func trimLiveChatMessages(_ messages: [LiveChatMessage], cap: Int = liveChatMemoryCap) -> [LiveChatMessage] {
    messages.count > cap ? Array(messages.suffix(cap)) : messages
}

/// What the chat composer should allow right now.
enum LiveChatComposerState: Equatable {
    case ready
    case empty
    case tooLong
    case coolingDown(seconds: Int)
    case muted
}

func liveChatComposerState(draft: String, cooldownRemaining: Int, isChatMuted: Bool) -> LiveChatComposerState {
    if isChatMuted { return .muted }
    if cooldownRemaining > 0 { return .coolingDown(seconds: cooldownRemaining) }
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return .empty }
    // UTF-16 units, not characters: the server checks JavaScript's
    // `string.length`, which counts an emoji as two. Counting graphemes
    // here would let an emoji-heavy message past the client and into a
    // server rejection.
    if trimmed.utf16.count > liveChatMaxLength { return .tooLong }
    return .ready
}
