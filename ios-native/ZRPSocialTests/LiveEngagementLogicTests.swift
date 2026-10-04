import XCTest
@testable import ZRPSocial

/// Pure-logic coverage for the ZRP Live engagement layer (chat, gifts,
/// reactions, replay, reminders) shared by Live Audio and Live Video.
/// Every rule tested here mirrors a real server-side constant or contract
/// in `src/lib/live-*`, named in each test.
final class LiveEngagementLogicTests: XCTestCase {

    // MARK: - Reaction batching (`MAX_TAPS_PER_REQUEST` = 20)

    func testTapsAccumulateIntoOneBatch() {
        var batcher = LiveReactionBatcher()
        let now = Date()
        for _ in 0..<7 {
            let counted = batcher.tap(now: now)
            XCTAssertTrue(counted)
        }
        let batch = batcher.takeBatch()
        let empty = batcher.takeBatch()
        XCTAssertEqual(batch, 7)
        XCTAssertNil(empty)
    }

    func testABatchNeverExceedsTheServerCap() {
        var batcher = LiveReactionBatcher()
        let now = Date()
        for _ in 0..<45 { _ = batcher.tap(now: now) }
        XCTAssertTrue(batcher.isFull)
        let batches = [batcher.takeBatch(), batcher.takeBatch(), batcher.takeBatch(), batcher.takeBatch()]
        XCTAssertEqual(batches, [20, 20, 5, nil])
    }

    func testRateLimitSilentlyStopsCountingUntilRetryAfter() {
        var batcher = LiveReactionBatcher()
        let now = Date()
        _ = batcher.tap(now: now)
        batcher.pause(now: now, retryAfter: 8)
        XCTAssertEqual(batcher.pending, 0, "pending taps are dropped, not replayed into the same rejection")
        let whilePaused = batcher.tap(now: now.addingTimeInterval(7))
        let nothingQueued = batcher.takeBatch()
        let afterPause = batcher.tap(now: now.addingTimeInterval(8))
        let resumed = batcher.takeBatch()
        XCTAssertFalse(whilePaused)
        XCTAssertNil(nothingQueued)
        XCTAssertTrue(afterPause)
        XCTAssertEqual(resumed, 1)
    }

    func testParticleCountIsProportionalButCapped() {
        XCTAssertEqual(liveReactionParticleCount(for: 1), 1)
        XCTAssertEqual(liveReactionParticleCount(for: 4), 4)
        XCTAssertEqual(liveReactionParticleCount(for: 20), 6)
        XCTAssertEqual(liveReactionParticleCount(for: 0), 1)
    }

    // MARK: - Gift animation queue

    private func banner(_ id: String, sender: String = "u1", gift: String = "rose", qty: Int = 1) -> LiveGiftBanner {
        LiveGiftBanner(id: id, senderId: sender, giftKey: gift, quantity: qty)
    }

    func testFirstGiftsGoStraightOnScreenUpToTheVisibleCap() {
        var queue = LiveGiftQueue(maxVisible: 2, maxPending: 5)
        let first = queue.enqueue(banner("a", sender: "u1"))
        let second = queue.enqueue(banner("b", sender: "u2"))
        let third = queue.enqueue(banner("c", sender: "u3"))
        XCTAssertEqual(first, .shown(id: "a"))
        XCTAssertEqual(second, .shown(id: "b"))
        XCTAssertEqual(third, .queued)
        XCTAssertEqual(queue.visible.map(\.id), ["a", "b"])
        XCTAssertEqual(queue.pending.map(\.id), ["c"])
    }

    func testARepeatGiftFromTheSameSenderFoldsIntoTheirBanner() {
        var queue = LiveGiftQueue()
        queue.enqueue(banner("a", qty: 2))
        let outcome = queue.enqueue(banner("b", qty: 3))
        XCTAssertEqual(outcome, .merged(id: "a"))
        XCTAssertEqual(queue.visible.count, 1)
        XCTAssertEqual(queue.visible[0].quantity, 5)
        XCTAssertEqual(queue.visible[0].generation, 1)
    }

    func testExpiryIsIgnoredWhileAComboIsStillGrowing() {
        var queue = LiveGiftQueue()
        queue.enqueue(banner("a"))
        queue.enqueue(banner("b"))
        let stale = queue.expire(id: "a", generation: 0)
        XCTAssertNil(stale)
        XCTAssertEqual(queue.visible.map(\.id), ["a"], "a stale expiry must not take down a merged banner")
        queue.expire(id: "a", generation: 1)
        XCTAssertTrue(queue.visible.isEmpty)
    }

    func testExpiringABannerPromotesTheNextWaitingOne() {
        var queue = LiveGiftQueue(maxVisible: 1, maxPending: 5)
        queue.enqueue(banner("a", sender: "u1"))
        queue.enqueue(banner("b", sender: "u2"))
        let promoted = queue.expire(id: "a", generation: 0)
        XCTAssertEqual(promoted?.id, "b")
        XCTAssertEqual(queue.visible.map(\.id), ["b"])
        XCTAssertTrue(queue.pending.isEmpty)
    }

    func testTheWaitingQueueIsBoundedAndDropsTheOldest() {
        var queue = LiveGiftQueue(maxVisible: 1, maxPending: 2)
        queue.enqueue(banner("a", sender: "u0"))
        queue.enqueue(banner("b", sender: "u1"))
        queue.enqueue(banner("c", sender: "u2"))
        queue.enqueue(banner("d", sender: "u3"))
        XCTAssertEqual(queue.pending.map(\.id), ["c", "d"])
    }

    // MARK: - Chat

    private func message(_ id: String, at seconds: TimeInterval, author: LiveChatAuthor? = nil) -> LiveChatMessage {
        LiveChatMessage(id: id, authorId: "u1", body: "hi", createdAt: Date(timeIntervalSince1970: seconds), author: author)
    }

    func testMergeDeduplicatesAndSortsOldestFirst() {
        let merged = mergeLiveChatMessages([message("b", at: 2), message("a", at: 1)], [message("c", at: 3), message("b", at: 2)])
        XCTAssertEqual(merged.map(\.id), ["a", "b", "c"])
    }

    func testMergeKeepsAKnownAuthorWhenTheBroadcastCopyHasNone() {
        let author = LiveChatAuthor(id: "u1", username: "ana", name: "Ana", avatarUrl: nil)
        let merged = mergeLiveChatMessages([message("a", at: 1, author: author)], [message("a", at: 1)])
        XCTAssertEqual(merged.first?.author, author)
    }

    func testTrimKeepsTheNewestMessages() {
        let messages = (0..<5).map { message("m\($0)", at: TimeInterval($0)) }
        XCTAssertEqual(trimLiveChatMessages(messages, cap: 3).map(\.id), ["m2", "m3", "m4"])
    }

    func testComposerStateMirrorsTheServerRules() {
        XCTAssertEqual(liveChatComposerState(draft: "  ", cooldownRemaining: 0, isChatMuted: false), .empty)
        XCTAssertEqual(liveChatComposerState(draft: "hello", cooldownRemaining: 0, isChatMuted: false), .ready)
        XCTAssertEqual(liveChatComposerState(draft: "hello", cooldownRemaining: 4, isChatMuted: false), .coolingDown(seconds: 4))
        XCTAssertEqual(liveChatComposerState(draft: "hello", cooldownRemaining: 0, isChatMuted: true), .muted)
        XCTAssertEqual(
            liveChatComposerState(draft: String(repeating: "a", count: 501), cooldownRemaining: 0, isChatMuted: false),
            .tooLong
        )
    }

    /// chat-service.ts checks JavaScript's `string.length` (UTF-16 units),
    /// so 300 two-unit emoji (600 units) are over the 500 limit even
    /// though they are only 300 characters.
    func testComposerCountsUtf16UnitsLikeTheServer() {
        let emoji = String(repeating: "\u{1F600}", count: 300)
        XCTAssertEqual(liveChatComposerState(draft: emoji, cooldownRemaining: 0, isChatMuted: false), .tooLong)
    }

    func testChatMessageDecodesTheListShapeWithANestedAuthor() throws {
        let json = #"{"id":"m1","body":"hi","createdAt":"2026-10-03T12:00:00.000Z","author":{"id":"u9","username":"ana","name":null,"avatarUrl":null}}"#
        let decoded = LiveSocketPayload.decode(LiveChatMessage.self, from: Data(json.utf8))
        XCTAssertEqual(decoded?.authorId, "u9")
        XCTAssertEqual(decoded?.author?.displayName, "ana")
    }

    func testChatMessageDecodesTheBroadcastShapeWithOnlyAnAuthorId() {
        let json = #"{"id":"m1","authorId":"u9","body":"hi","createdAt":"2026-10-03T12:00:00Z"}"#
        let decoded = LiveSocketPayload.decode(LiveChatMessage.self, from: Data(json.utf8))
        XCTAssertEqual(decoded?.authorId, "u9")
        XCTAssertNil(decoded?.author)
    }

    // MARK: - Gifts

    func testGiftDisplayNameIsDerivedFromTheAdminSlug() {
        XCTAssertEqual(liveGiftDisplayName("rose"), "Rose")
        XCTAssertEqual(liveGiftDisplayName("fire_heart"), "Fire heart")
        XCTAssertEqual(liveGiftDisplayName("super-star"), "Super star")
    }

    func testOnlyAnUncertainOutcomeKeepsTheIdempotencyKeyForRetry() {
        XCTAssertFalse(LiveEngagementViewModel.isDefinitive(.offline))
        XCTAssertFalse(LiveEngagementViewModel.isDefinitive(.transport(underlying: "reset")))
        XCTAssertFalse(LiveEngagementViewModel.isDefinitive(.server(status: 502, message: nil, code: nil)))
        XCTAssertTrue(LiveEngagementViewModel.isDefinitive(.server(status: 402, message: nil, code: "insufficient_balance")))
        XCTAssertTrue(LiveEngagementViewModel.isDefinitive(.forbidden(message: nil, code: "blocked")))
    }

    // MARK: - Typed error codes -> specific copy

    func testEveryTypedGiftErrorHasItsOwnCopy() {
        let codes = ["insufficient_balance", "gift_not_found", "gift_disabled", "cannot_gift_self",
                     "not_participant", "blocked", "room_not_live", "duplicate_transaction"]
        let keys = codes.compactMap { LiveErrorText.key(forCode: $0, action: .gift) }
        XCTAssertEqual(keys.count, codes.count)
        XCTAssertEqual(Set(keys).count, codes.count, "each gift error must read differently")
        XCTAssertEqual(LiveErrorText.key(forCode: "blocked", action: .gift), .iosLiveErrGiftBlocked)
    }

    func testEveryTypedChatErrorHasItsOwnCopy() {
        XCTAssertEqual(LiveErrorText.key(forCode: "chat_muted", action: .chat), .iosLiveErrChatMuted)
        XCTAssertEqual(LiveErrorText.key(forCode: "slow_mode", action: .chat), .iosLiveChatCooldown)
        XCTAssertEqual(LiveErrorText.key(forCode: "rate_limited", action: .chat), .iosLiveErrChatRateLimited)
        XCTAssertEqual(LiveErrorText.key(forCode: "not_participant", action: .chat), .iosLiveErrNotParticipant)
        XCTAssertEqual(LiveErrorText.key(forCode: "blocked", action: .chat), .iosLiveErrChatBlocked)
        XCTAssertEqual(LiveErrorText.key(forCode: "validation_error", action: .chat), .iosLiveErrMessageTooLong)
    }

    func testReminderAndReplayErrorsHaveTheirOwnCopy() {
        XCTAssertEqual(LiveErrorText.key(forCode: "not_scheduled", action: .reminder), .iosLiveErrNotScheduled)
        XCTAssertEqual(LiveErrorText.key(forCode: "cannot_remind_self", action: .reminder), .iosLiveErrCannotRemindSelf)
        XCTAssertEqual(LiveErrorText.key(forCode: "replay_not_configured", action: .replay), .iosLiveErrReplayNotConfigured)
        XCTAssertNil(LiveErrorText.key(forCode: "something_new", action: .replay))
    }

    func testA429CarriesItsCodeAndRetryAfterThrough() {
        let error = ApiError.rateLimited(message: "Slow mode is on", code: "slow_mode", retryAfter: 7)
        XCTAssertEqual(error.serverCode, "slow_mode")
        XCTAssertEqual(error.retryAfterSeconds, 7)
        XCTAssertTrue(error.isRetryable)
    }

    // MARK: - Routes

    /// The literal paths the server serves, per room kind.
    func testEngagementRoutesAreTheServersOwnPaths() {
        typealias Repo = LiveEngagementRepository
        XCTAssertEqual(Repo.roomPath(.audio, "r1", .gifts), "live-audio/rooms/r1/gifts")
        XCTAssertEqual(Repo.roomPath(.video, "r1", .gifts), "live-video/rooms/r1/gifts")
        XCTAssertEqual(Repo.roomPath(.video, "r1", .chatMessage(id: "m1")), "live-video/rooms/r1/chat/m1")
        XCTAssertEqual(Repo.roomPath(.audio, "r1", .chatSlowMode), "live-audio/rooms/r1/chat/slow-mode")
        XCTAssertEqual(Repo.roomPath(.video, "r1", .reminder), "live-video/rooms/r1/reminder")
        XCTAssertEqual(Repo.roomPath(.audio, "r1", .replayRecording(id: "rec")), "live-audio/rooms/r1/replay/rec")
        XCTAssertEqual(Repo.roomPath(.video, "a/b", .reactions), "live-video/rooms/a%2Fb/reactions")
    }

    // MARK: - Live Video stage

    private func participant(_ id: String, role: String) -> LiveVideoParticipant {
        LiveVideoParticipant(
            role: role,
            isMuted: false,
            isCameraOff: false,
            joinedAt: Date(timeIntervalSince1970: 0),
            user: LiveAudioHost(id: id, username: id, name: nil, avatarUrl: nil, badgeType: nil)
        )
    }

    func testTheHostLeadsTheStageAndViewersAreNotOnIt() {
        let stage = liveVideoStageOrder([
            participant("s1", role: "SPEAKER"),
            participant("v1", role: "LISTENER"),
            participant("h", role: "HOST"),
            participant("m", role: "MODERATOR"),
        ])
        XCTAssertEqual(stage.map(\.user.id), ["h", "s1", "m"])
    }
}
