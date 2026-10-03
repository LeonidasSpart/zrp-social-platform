import Foundation

/// One burst of floating reaction particles.
struct LiveReactionBurst: Identifiable, Equatable {
    let id = UUID()
    /// Particles actually drawn - `liveReactionParticleCount(for:)`.
    let particles: Int
    /// Taps beyond what is drawn, shown as a "+N" so a large batch still
    /// reads as large.
    let overflow: Int
    /// The viewer's own tap animates immediately, before the batch is
    /// even sent; everyone else's arrives over `live-reaction:tap`.
    let isMine: Bool
}

/// Everything inside a live room besides the room itself - chat, gifts,
/// reactions, replay and the scheduled-room reminder - for either room
/// kind. Owned by `LiveAudioRoomViewModel`/`LiveVideoRoomViewModel`,
/// which hand it the room context (who I am, who hosts, my role, who is
/// in the room) every time their own state refreshes, and start/stop it
/// with the room connection.
///
/// It listens on the app-wide `ZrpSocket` for the engagement events the
/// server broadcasts to the room channel the room view model joined:
///
///   live-chat:message            {id, authorId, body, createdAt}
///   live-chat:message-deleted    {id}
///   live-chat:mute-changed       {userId, isChatMuted}
///   live-chat:slow-mode-changed  {seconds}
///   live-gift:sent               {transactionId, senderId, giftKey, quantity, totalCoins}
///   live-reaction:tap            {userId, count, roomReactionCount}
///   live-replay:recording-started {recordingId}
///
/// Nothing is ever shown as having happened before the server says it
/// did: a sent message appears from the `POST` response or the
/// broadcast, a gift animation only ever comes from `live-gift:sent`
/// (emitted after the ledger commits), and the coin balance is always
/// re-read from `GET /api/wallet/coins/balance`, never decremented
/// locally. The one deliberate exception is the viewer's own reaction
/// tap, which animates immediately because it is a cosmetic echo of an
/// action whose only server effect is a counter.
@MainActor
final class LiveEngagementViewModel: ObservableObject {

    enum LoadPhase: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    let kind: LiveRoomKind
    let roomId: String

    private let repository: LiveEngagementRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var isStarted = false

    // MARK: Room context

    @Published private(set) var myUserId: String?
    @Published private(set) var hostId: String?
    @Published private(set) var myRole: String?
    /// Display info for everyone currently in the room, plus every chat
    /// author seen in a fetched page - what resolves an `authorId`-only
    /// broadcast or a gift's `senderId` to a name and avatar.
    @Published private(set) var people: [String: LiveChatAuthor] = [:]

    var amAuthority: Bool { isLiveAudioAuthority(myRole) }
    var amHost: Bool { myUserId != nil && myUserId == hostId }

    // MARK: Chat

    @Published private(set) var messages: [LiveChatMessage] = []
    @Published private(set) var chatPhase: LoadPhase = .idle
    @Published private(set) var hasOlderMessages = false
    @Published private(set) var isLoadingOlder = false
    @Published var draft = ""
    @Published private(set) var isSendingMessage = false
    @Published private(set) var slowModeSeconds = 0
    @Published private(set) var cooldownRemaining = 0
    @Published private(set) var isChatMuted = false
    /// Chat-mute state per user, as far as this screen has seen it. The
    /// room detail route does not report `isChatMuted`, so a mute that
    /// happened before this screen opened is unknown until it changes
    /// again - the moderation menu offers both actions in that case
    /// rather than guessing.
    @Published private(set) var knownChatMutes: [String: Bool] = [:]
    @Published var chatError: String?
    private var olderCursor: String?
    private var cooldownTask: Task<Void, Never>?
    private var authorRefreshTask: Task<Void, Never>?

    var composerState: LiveChatComposerState {
        liveChatComposerState(draft: draft, cooldownRemaining: cooldownRemaining, isChatMuted: isChatMuted)
    }

    // MARK: Gifts

    @Published private(set) var catalog: [LiveGift] = []
    @Published private(set) var catalogPhase: LoadPhase = .idle
    @Published private(set) var coinBalance: Int?
    @Published private(set) var isSendingGift = false
    @Published var giftError: String?
    @Published private(set) var giftErrorIsInsufficientBalance = false
    @Published private(set) var giftQueue = LiveGiftQueue()
    /// The idempotency key of a send whose outcome is unknown (the
    /// request may or may not have reached the server). Retrying that
    /// same gift reuses it, so a retry can never charge twice.
    private var unsettledGift: (giftKey: String, quantity: Int, idempotencyKey: String)?

    // MARK: Reactions

    @Published private(set) var roomReactionCount = 0
    @Published private(set) var reactionBursts: [LiveReactionBurst] = []
    private var batcher = LiveReactionBatcher()
    private var flushTask: Task<Void, Never>?
    private var isFlushingReactions = false

    // MARK: Replay

    @Published private(set) var isRecording = false
    @Published private(set) var isRecordingBusy = false
    /// The reason recording could not start/stop - most often, today,
    /// `replay_not_configured` (no Egress storage bucket exists on this
    /// deployment yet). Shown next to the control, which stays visible.
    @Published var replayNotice: String?
    @Published private(set) var recordings: [LiveRecording] = []
    @Published private(set) var recordingsPhase: LoadPhase = .idle
    @Published private(set) var deletingRecordingId: String?

    // MARK: Reminder

    /// What this device last told the server. There is no route that
    /// reports an existing reminder, so this starts `false`; setting a
    /// reminder that already exists is idempotent server-side.
    @Published private(set) var reminderSet = false
    @Published private(set) var isReminderBusy = false
    @Published var reminderError: String?

    init(
        kind: LiveRoomKind,
        roomId: String,
        repository: LiveEngagementRepositoryProtocol = LiveEngagementRepository(),
        socket: ZrpSocket? = nil
    ) {
        self.kind = kind
        self.roomId = roomId
        self.repository = repository
        // Not a default argument - see `LiveAudioRoomViewModel.init`.
        self.socket = socket ?? .shared
    }

    // MARK: - Lifecycle

    /// Called by the room view model every time its own detail refreshes.
    func updateContext(
        myUserId: String?,
        room: LiveAudioRoom,
        myRole: String?,
        people: [LiveChatAuthor]
    ) {
        self.myUserId = myUserId
        self.hostId = room.hostId
        self.myRole = myRole
        for person in people { self.people[person.id] = person }
        if let seconds = room.slowModeSeconds { slowModeSeconds = seconds }
        if let count = room.reactionCount { roomReactionCount = max(roomReactionCount, count) }
    }

    /// Starts listening and loads the chat history and gift catalog.
    /// Called once the room is connected (its socket channel joined).
    func start() {
        guard !isStarted else { return }
        isStarted = true
        socketToken = socket.subscribe { [weak self] event in
            self?.handle(event)
        }
        Task { await self.loadChat() }
        Task { await self.loadCatalog() }
    }

    func stop() {
        isStarted = false
        if let socketToken { socket.unsubscribe(socketToken) }
        socketToken = nil
        cooldownTask?.cancel()
        cooldownTask = nil
        authorRefreshTask?.cancel()
        authorRefreshTask = nil
        flushTask?.cancel()
        flushTask = nil
        giftQueue.removeAll()
        reactionBursts.removeAll()
    }

    // MARK: - Realtime

    private func handle(_ event: SocketEvent) {
        switch event.name {
        case "live-chat:message":
            guard let message = LiveSocketPayload.decode(LiveChatMessage.self, from: event.data) else { return }
            messages = trimLiveChatMessages(mergeLiveChatMessages(messages, [message]))
            if message.author == nil, people[message.authorId] == nil { scheduleAuthorRefresh() }

        case "live-chat:message-deleted":
            guard let payload = LiveSocketPayload.decode(LiveChatDeletedPayload.self, from: event.data) else { return }
            messages.removeAll { $0.id == payload.id }

        case "live-chat:mute-changed":
            guard let payload = LiveSocketPayload.decode(LiveChatMuteChangedPayload.self, from: event.data) else { return }
            knownChatMutes[payload.userId] = payload.isChatMuted
            if payload.userId == myUserId { isChatMuted = payload.isChatMuted }

        case "live-chat:slow-mode-changed":
            guard let payload = LiveSocketPayload.decode(LiveSlowModeChangedPayload.self, from: event.data) else { return }
            slowModeSeconds = payload.seconds
            if payload.seconds == 0 { stopCooldown() }

        case "live-gift:sent":
            guard let payload = LiveSocketPayload.decode(LiveGiftSentPayload.self, from: event.data) else { return }
            showGift(payload)

        case "live-reaction:tap":
            guard let payload = LiveSocketPayload.decode(LiveReactionTapPayload.self, from: event.data) else { return }
            roomReactionCount = max(roomReactionCount, payload.roomReactionCount)
            // My own taps already animated the moment I made them.
            if payload.userId != myUserId { addBurst(count: payload.count, isMine: false) }

        case "live-replay:recording-started":
            if amAuthority { isRecording = true }

        default:
            break
        }
    }

    // MARK: - Chat

    func author(of message: LiveChatMessage) -> LiveChatAuthor? {
        message.author ?? people[message.authorId]
    }

    func canDelete(_ message: LiveChatMessage) -> Bool {
        message.authorId == myUserId || amAuthority
    }

    /// Host/moderator can chat-mute anyone but themselves and the host.
    func canChatMute(userId: String) -> Bool {
        amAuthority && userId != myUserId && userId != hostId
    }

    func loadChat() async {
        if messages.isEmpty { chatPhase = .loading }
        do {
            let page = try await repository.chatMessages(kind: kind, roomId: roomId, cursor: nil)
            absorbAuthors(page.messages)
            messages = trimLiveChatMessages(mergeLiveChatMessages(messages, page.messages))
            olderCursor = page.nextCursor
            hasOlderMessages = page.nextCursor != nil
            chatPhase = .loaded
        } catch {
            if messages.isEmpty {
                chatPhase = .failed(LiveErrorText.message(for: error, action: .chat))
            }
        }
    }

    func loadOlderMessages() {
        guard let cursor = olderCursor, !isLoadingOlder else { return }
        isLoadingOlder = true
        Task {
            defer { self.isLoadingOlder = false }
            do {
                let page = try await repository.chatMessages(kind: kind, roomId: roomId, cursor: cursor)
                absorbAuthors(page.messages)
                // Older pages extend the history, so the memory cap is
                // not applied here - it would discard what was just
                // asked for.
                messages = mergeLiveChatMessages(messages, page.messages)
                olderCursor = page.nextCursor
                hasOlderMessages = page.nextCursor != nil
            } catch {
                chatError = LiveErrorText.message(for: error, action: .chat)
            }
        }
    }

    func sendMessage() {
        guard composerState == .ready, !isSendingMessage else { return }
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        isSendingMessage = true
        chatError = nil
        Task {
            defer { self.isSendingMessage = false }
            do {
                let message = try await repository.sendChatMessage(kind: kind, roomId: roomId, body: body)
                if draft.trimmingCharacters(in: .whitespacesAndNewlines) == body { draft = "" }
                messages = trimLiveChatMessages(mergeLiveChatMessages(messages, [message]))
                if slowModeSeconds > 0 { startCooldown(seconds: slowModeSeconds) }
            } catch let error as ApiError {
                switch error.serverCode {
                case "slow_mode":
                    // The countdown is the message.
                    startCooldown(seconds: Int((error.retryAfterSeconds ?? Double(max(1, slowModeSeconds))).rounded(.up)))
                    return
                case "chat_muted":
                    isChatMuted = true
                default:
                    break
                }
                chatError = LiveErrorText.message(for: error, action: .chat)
            } catch {
                chatError = LiveErrorText.message(for: error, action: .chat)
            }
        }
    }

    func deleteMessage(_ message: LiveChatMessage) {
        guard canDelete(message) else { return }
        Task {
            do {
                try await repository.deleteChatMessage(kind: kind, roomId: roomId, messageId: message.id)
                messages.removeAll { $0.id == message.id }
            } catch {
                chatError = LiveErrorText.message(for: error, action: .moderation)
            }
        }
    }

    func setChatMute(userId: String, muted: Bool) {
        guard canChatMute(userId: userId) else { return }
        Task {
            do {
                try await repository.setChatMute(kind: kind, roomId: roomId, userId: userId, muted: muted)
                knownChatMutes[userId] = muted
            } catch {
                chatError = LiveErrorText.message(for: error, action: .moderation)
            }
        }
    }

    func setSlowMode(seconds: Int) {
        guard amAuthority else { return }
        Task {
            do {
                try await repository.setSlowMode(kind: kind, roomId: roomId, seconds: seconds)
                slowModeSeconds = seconds
                if seconds == 0 { stopCooldown() }
            } catch {
                chatError = LiveErrorText.message(for: error, action: .moderation)
            }
        }
    }

    func dismissChatError() { chatError = nil }

    private func startCooldown(seconds: Int) {
        cooldownTask?.cancel()
        cooldownRemaining = max(0, seconds)
        guard cooldownRemaining > 0 else { return }
        cooldownTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, !Task.isCancelled else { return }
                self.cooldownRemaining = max(0, self.cooldownRemaining - 1)
                if self.cooldownRemaining == 0 { return }
            }
        }
    }

    private func stopCooldown() {
        cooldownTask?.cancel()
        cooldownTask = nil
        cooldownRemaining = 0
    }

    private func absorbAuthors(_ page: [LiveChatMessage]) {
        for message in page {
            if let author = message.author { people[author.id] = author }
        }
    }

    /// A broadcast from someone this screen has no name for (they left,
    /// or joined between two detail refreshes): re-read the newest page,
    /// whose rows carry full author objects. Debounced so a burst of
    /// messages costs one request.
    private func scheduleAuthorRefresh() {
        guard authorRefreshTask == nil else { return }
        authorRefreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard let self, !Task.isCancelled else { return }
            self.authorRefreshTask = nil
            await self.loadChat()
        }
    }

    // MARK: - Gifts

    /// The gift panel opened: refresh the balance (always - it is real
    /// money's worth and must never be stale) and the catalog if needed.
    func loadGiftPanel() async {
        giftError = nil
        giftErrorIsInsufficientBalance = false
        await refreshBalance()
        await loadCatalog()
    }

    func loadCatalog() async {
        guard catalogPhase != .loading else { return }
        if catalog.isEmpty { catalogPhase = .loading }
        do {
            catalog = try await repository.giftCatalog()
            catalogPhase = .loaded
        } catch {
            if catalog.isEmpty {
                catalogPhase = .failed(LiveErrorText.message(for: error, action: .gift))
            }
        }
    }

    func refreshBalance() async {
        if let balance = try? await repository.coinBalance() {
            coinBalance = balance
        }
    }

    func gift(forKey key: String) -> LiveGift? {
        catalog.first { $0.key == key }
    }

    /// Sends a gift and reports whether the server accepted it.
    func sendGift(_ gift: LiveGift, quantity: Int) async -> Bool {
        guard !isSendingGift, !amHost, (1...liveGiftMaxQuantity).contains(quantity) else { return false }

        let idempotencyKey: String
        if let unsettled = unsettledGift, unsettled.giftKey == gift.key, unsettled.quantity == quantity {
            idempotencyKey = unsettled.idempotencyKey
        } else {
            idempotencyKey = UUID().uuidString
            unsettledGift = (gift.key, quantity, idempotencyKey)
        }

        isSendingGift = true
        giftError = nil
        giftErrorIsInsufficientBalance = false
        defer { isSendingGift = false }

        do {
            _ = try await repository.sendGift(
                kind: kind,
                roomId: roomId,
                request: LiveSendGiftRequest(giftKey: gift.key, quantity: quantity, idempotencyKey: idempotencyKey)
            )
            unsettledGift = nil
            await refreshBalance()
            return true
        } catch let error as ApiError {
            if Self.isDefinitive(error) { unsettledGift = nil }
            giftErrorIsInsufficientBalance = error.serverCode == "insufficient_balance"
            giftError = LiveErrorText.message(for: error, action: .gift)
            switch error.serverCode {
            case "gift_not_found", "gift_disabled":
                await loadCatalog()
            case "insufficient_balance", "duplicate_transaction":
                await refreshBalance()
            default:
                break
            }
            return false
        } catch {
            giftError = LiveErrorText.message(for: error, action: .gift)
            return false
        }
    }

    /// Whether the server definitely processed (and answered) the send.
    /// A transport failure or a 5xx leaves the outcome unknown, so the
    /// idempotency key is kept for the retry.
    nonisolated static func isDefinitive(_ error: ApiError) -> Bool {
        switch error {
        case .offline, .transport, .cancelled, .decoding:
            return false
        case .server(let status, _, _):
            return status < 500
        default:
            return true
        }
    }

    private func showGift(_ payload: LiveGiftSentPayload) {
        let banner = LiveGiftBanner(
            id: payload.transactionId,
            senderId: payload.senderId,
            giftKey: payload.giftKey,
            quantity: payload.quantity
        )
        switch giftQueue.enqueue(banner) {
        case .shown(let id):
            scheduleGiftExpiry(id: id, generation: 0)
        case .merged(let id):
            if let current = giftQueue.visible.first(where: { $0.id == id }) {
                scheduleGiftExpiry(id: id, generation: current.generation)
            }
        case .queued:
            break
        }
    }

    private func scheduleGiftExpiry(id: String, generation: Int) {
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(3200))
            guard let self else { return }
            if let next = self.giftQueue.expire(id: id, generation: generation) {
                self.scheduleGiftExpiry(id: next.id, generation: next.generation)
            }
        }
    }

    // MARK: - Reactions

    func tapReaction() {
        guard batcher.tap(now: Date()) else { return }
        addBurst(count: 1, isMine: true)
        if batcher.isFull {
            flushReactions()
        } else {
            scheduleReactionFlush()
        }
    }

    private func scheduleReactionFlush() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(600))
            guard let self, !Task.isCancelled else { return }
            self.flushTask = nil
            self.flushReactions()
        }
    }

    private func flushReactions() {
        guard !isFlushingReactions, let batch = batcher.takeBatch() else { return }
        isFlushingReactions = true
        Task {
            do {
                let total = try await repository.sendReactions(kind: kind, roomId: roomId, count: batch)
                roomReactionCount = max(roomReactionCount, total)
            } catch let error as ApiError {
                // Silent by design (see `LiveReactionBatcher`): a rate
                // limit just stops counting for a while; anything else
                // drops this batch.
                if error.serverCode == "rate_limited" || error.retryAfterSeconds != nil {
                    batcher.pause(now: Date(), retryAfter: error.retryAfterSeconds)
                } else if case .rateLimited = error {
                    batcher.pause(now: Date(), retryAfter: nil)
                }
            } catch {
                // Dropped, silently.
            }
            isFlushingReactions = false
            if batcher.pending > 0 { scheduleReactionFlush() }
        }
    }

    private func addBurst(count: Int, isMine: Bool) {
        let particles = liveReactionParticleCount(for: count)
        let burst = LiveReactionBurst(particles: particles, overflow: max(0, count - particles), isMine: isMine)
        reactionBursts.append(burst)
        if reactionBursts.count > 12 { reactionBursts.removeFirst(reactionBursts.count - 12) }
        let id = burst.id
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(2200))
            self?.reactionBursts.removeAll { $0.id == id }
        }
    }

    // MARK: - Replay

    func startRecording() {
        guard amAuthority, !isRecordingBusy else { return }
        isRecordingBusy = true
        replayNotice = nil
        Task {
            defer { self.isRecordingBusy = false }
            do {
                _ = try await repository.startRecording(kind: kind, roomId: roomId)
                isRecording = true
            } catch let error as ApiError {
                if error.serverCode == "already_recording" { isRecording = true }
                replayNotice = LiveErrorText.message(for: error, action: .replay)
            } catch {
                replayNotice = LiveErrorText.message(for: error, action: .replay)
            }
        }
    }

    func stopRecording() {
        guard amAuthority, !isRecordingBusy else { return }
        isRecordingBusy = true
        replayNotice = nil
        Task {
            defer { self.isRecordingBusy = false }
            do {
                try await repository.stopRecording(kind: kind, roomId: roomId)
                isRecording = false
            } catch let error as ApiError {
                if error.serverCode == "not_recording" { isRecording = false }
                replayNotice = LiveErrorText.message(for: error, action: .replay)
            } catch {
                replayNotice = LiveErrorText.message(for: error, action: .replay)
            }
        }
    }

    func loadRecordings() async {
        recordingsPhase = .loading
        do {
            recordings = try await repository.recordings(kind: kind, roomId: roomId)
            recordingsPhase = .loaded
        } catch {
            recordingsPhase = .failed(LiveErrorText.message(for: error, action: .replay))
        }
    }

    func deleteRecording(_ recording: LiveRecording) {
        guard amAuthority, deletingRecordingId == nil else { return }
        deletingRecordingId = recording.id
        Task {
            defer { self.deletingRecordingId = nil }
            do {
                try await repository.deleteRecording(kind: kind, roomId: roomId, recordingId: recording.id)
                recordings.removeAll { $0.id == recording.id }
            } catch {
                replayNotice = LiveErrorText.message(for: error, action: .replay)
            }
        }
    }

    // MARK: - Reminder

    func toggleReminder() {
        guard !isReminderBusy, !amHost else { return }
        let turningOn = !reminderSet
        isReminderBusy = true
        reminderError = nil
        Task {
            defer { self.isReminderBusy = false }
            do {
                if turningOn {
                    try await repository.setReminder(kind: kind, roomId: roomId)
                } else {
                    try await repository.clearReminder(kind: kind, roomId: roomId)
                }
                reminderSet = turningOn
            } catch {
                reminderError = LiveErrorText.message(for: error, action: .reminder)
            }
        }
    }
}
