import Foundation
import SwiftUI

@MainActor
final class ConversationViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var messages: [Message] = []
    @Published private(set) var phase: Phase = .loading
    @Published var draft: String = ""
    @Published private(set) var isSending = false
    @Published var replyTarget: Message?
    @Published var errorMessage: String?

    /// A picture chosen but not yet sent. Held here rather than uploaded
    /// on selection so someone can change their mind without having
    /// already put the file on UploadThing.
    @Published var pendingImage: PickedMedia?

    /// Upload progress, 0…1, while a chosen picture is being sent.
    @Published private(set) var uploadProgress: Double?

    let partner: PostAuthor
    let viewerId: String?

    /// Whether the other person is typing, from the server's own
    /// `user-typing` relay. Never inferred locally.
    @Published private(set) var partnerIsTyping = false

    private let repository: MessagesRepositoryProtocol
    private let uploads: UploadThingClient
    private var pollTask: Task<Void, Never>?
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var typingResetTask: Task<Void, Never>?
    private var lastTypingSentAt: Date?

    /// How often the open thread refetches **when the socket is not
    /// connected**.
    ///
    /// Live delivery now comes from the same Socket.IO server the website
    /// and Android use. Polling stays as the fallback for the case that
    /// actually happens - a dropped connection, a server restart - rather
    /// than being deleted on the assumption the socket is always up. When
    /// the socket is connected this interval is long, because it is only
    /// a safety net for an event that never arrived; when it is not, it
    /// is the delivery mechanism.
    private let connectedPollInterval: Duration = .seconds(30)
    private let disconnectedPollInterval: Duration = .seconds(6)

    init(
        partner: PostAuthor,
        viewerId: String?,
        initialDraft: String = "",
        repository: MessagesRepositoryProtocol = MessagesRepository(),
        uploads: UploadThingClient = UploadThingClient(),
        socket: ZrpSocket = .shared
    ) {
        self.partner = partner
        self.viewerId = viewerId
        self.repository = repository
        self.uploads = uploads
        self.socket = socket
        // Pre-filled, never auto-sent. "Contact Seller" in the
        // marketplace opens this thread with the same opening line and
        // listing link the website composes - the person still reads it,
        // edits it, and decides to send.
        self.draft = initialDraft
    }

    func isOwn(_ message: Message) -> Bool {
        message.senderId == viewerId
    }

    // MARK: - Loading

    func start() async {
        socket.connect()
        subscribeToSocket()
        await load(showLoading: messages.isEmpty)
        startPolling()
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        typingResetTask?.cancel()
        typingResetTask = nil
        if let socketToken { socket.unsubscribe(socketToken) }
        socketToken = nil
        partnerIsTyping = false
    }

    private func startPolling() {
        pollTask?.cancel()
        // Inherits this view model's main-actor isolation, so the
        // socket's connection state can be read directly each time round
        // rather than being sampled once when the loop started.
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let interval = self.socket.isConnected
                    ? self.connectedPollInterval
                    : self.disconnectedPollInterval
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { return }
                await self.load(showLoading: false)
            }
        }
    }

    // MARK: - Realtime

    /// Every relayed event that concerns *this* thread.
    ///
    /// The socket carries no history and no authority - it is a relay
    /// (`server.js` forwards, the REST API persists) - so each event
    /// triggers a refetch rather than being applied to the array
    /// directly. That keeps one source of truth for what a thread
    /// contains and cannot drift; the gain is that the refetch happens
    /// the instant something changes instead of at the next poll.
    private func subscribeToSocket() {
        guard socketToken == nil else { return }
        socketToken = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "receive-message", "message-deleted", "message-edited",
                 "reaction-updated", "message-read":
                Task { await self.load(showLoading: false) }

            case "user-typing":
                self.applyTyping(event.data)

            default:
                break
            }
        }
    }

    private struct TypingEvent: Decodable {
        let userId: String
        let isTyping: Bool
    }

    private func applyTyping(_ data: Data) {
        guard
            let event = try? JSONDecoder().decode(TypingEvent.self, from: data),
            event.userId == partner.id
        else { return }

        partnerIsTyping = event.isTyping
        typingResetTask?.cancel()
        guard event.isTyping else { return }
        // The server relays "started" and "stopped" separately, and a
        // "stopped" can be lost with the connection. Without this the
        // indicator would stay on screen for the rest of the session.
        typingResetTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.partnerIsTyping = false
        }
    }

    /// Tells the other side this person is typing.
    ///
    /// Throttled to one event every two seconds: the server relays each
    /// one to the other party, and a keystroke-per-event stream is both
    /// pointless and rate-limited.
    func reportTyping() {
        let now = Date()
        if let last = lastTypingSentAt, now.timeIntervalSince(last) < 2 { return }
        lastTypingSentAt = now
        socket.emit("typing", ["receiverId": partner.id, "isTyping": true])
    }

    private func reportStoppedTyping() {
        lastTypingSentAt = nil
        socket.emit("typing", ["receiverId": partner.id, "isTyping": false])
    }

    private func load(showLoading: Bool) async {
        if showLoading { phase = .loading }
        do {
            let fetched = try await repository.thread(with: partner.id)
            guard !Task.isCancelled else { return }
            // Only publish when something actually changed, so a poll
            // does not churn the list and fight the scroll position.
            if fetched != messages { messages = fetched }
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            // A failed poll must not replace a thread already on screen.
            if messages.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            }
        }
    }

    // MARK: - Sending

    /// Sendable when there is text OR a picture. The route accepts an
    /// empty `content` only alongside an `imageUrl` and refuses both
    /// empty with a 400, so this mirrors its rule exactly rather than
    /// letting someone press send into a refusal.
    var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pendingImage != nil
    }

    func send() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend, !isSending else { return }

        isSending = true
        defer {
            isSending = false
            uploadProgress = nil
        }

        // Uploaded first, and only on send: the message route stores a
        // URL, so the file has to exist before it is referenced. A failed
        // upload stops here rather than sending the text alone and
        // silently dropping the picture.
        var uploadedImageUrl: String?
        if let pendingImage {
            uploadProgress = 0
            do {
                let uploaded = try await uploads.upload(
                    pendingImage.asUploadCandidate(),
                    to: .chatImage,
                    onProgress: { [weak self] progress in
                        Task { @MainActor in self?.uploadProgress = progress }
                    }
                )
                uploadedImageUrl = uploaded.url
            } catch UploadThingClient.UploadError.cancelled {
                return
            } catch {
                errorMessage = (error as? ApiError)?.userFacingMessage
                    ?? L10n.string(.authErrTryAgain)
                return
            }
        }

        do {
            let sent = try await repository.send(
                to: partner.id,
                content: content,
                imageUrl: uploadedImageUrl,
                replyToId: replyTarget?.id
            )
            // Appended from the route's own 201 response rather than
            // refetching the whole thread.
            if !messages.contains(where: { $0.id == sent.id }) {
                messages.append(sent)
            }
            draft = ""
            replyTarget = nil
            pendingImage = nil
            reportStoppedTyping()
            // A courtesy to the other side: the message is already
            // stored by the route above, and this only makes it appear
            // in their open thread now rather than at their next poll.
            // server.js relays `content` and the id; the recipient
            // refetches from it, so nothing here is authoritative.
            socket.emit(
                "send-message",
                ["receiverId": partner.id, "content": sent.content, "messageId": sent.id]
            )
        } catch let error as ApiError {
            // A 403 here is a real rule - the recipient's privacy
            // settings or a block - and the server says it better than
            // the client could.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    func edit(_ message: Message, to content: String) async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let updated = try await repository.edit(messageId: message.id, content: trimmed)
            replace(updated)
            socket.emit(
                "edit-message",
                ["receiverId": partner.id, "message": ["id": updated.id, "content": updated.content]]
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    func delete(_ message: Message) async {
        do {
            try await repository.delete(messageId: message.id)
            messages.removeAll { $0.id == message.id }
            socket.emit(
                "delete-message",
                ["receiverId": partner.id, "messageId": message.id]
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    /// The route returns the message's complete reaction list after the
    /// toggle, so that is applied wholesale rather than the client
    /// predicting the result of add/remove/replace.
    func react(to message: Message, emoji: String) async {
        do {
            let reactions = try await repository.react(messageId: message.id, emoji: emoji)
            applyReactions(reactions, to: message.id)
            // The relay carries only the message id; the other side
            // refetches the authoritative list from the route.
            socket.emit(
                "message-reaction",
                ["receiverId": partner.id, "messageId": message.id, "reactions": []]
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    private func replace(_ updated: Message) {
        guard let index = messages.firstIndex(where: { $0.id == updated.id }) else { return }
        messages[index] = updated
    }

    /// `Message` decodes with `let` fields, so the row is refetched from
    /// the next poll for anything other than its reactions - which the
    /// reaction route hands back directly and which are swapped in here.
    private func applyReactions(_ reactions: [MessageReaction], to messageId: String) {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }
        messages[index].reactions = reactions
    }
}
