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

    let partner: PostAuthor
    let viewerId: String?

    private let repository: MessagesRepositoryProtocol
    private var pollTask: Task<Void, Never>?

    /// How often the open thread refetches.
    ///
    /// The website has Socket.io for live delivery; this client polls
    /// instead, as the Android app does. It is honest polling, not
    /// simulated realtime - 6 seconds is frequent enough to feel current
    /// without hammering a route that returns the entire thread every
    /// time (see `MessagesRepository.thread` - it is unpaginated).
    private let pollInterval: Duration = .seconds(6)

    init(
        partner: PostAuthor,
        viewerId: String?,
        initialDraft: String = "",
        repository: MessagesRepositoryProtocol = MessagesRepository()
    ) {
        self.partner = partner
        self.viewerId = viewerId
        self.repository = repository
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
        await load(showLoading: messages.isEmpty)
        startPolling()
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: self?.pollInterval ?? .seconds(6))
                guard !Task.isCancelled else { return }
                await self?.load(showLoading: false)
            }
        }
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

    func send() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isSending else { return }

        isSending = true
        defer { isSending = false }

        do {
            let sent = try await repository.send(
                to: partner.id,
                content: content,
                replyToId: replyTarget?.id
            )
            // Appended from the route's own 201 response rather than
            // refetching the whole thread.
            if !messages.contains(where: { $0.id == sent.id }) {
                messages.append(sent)
            }
            draft = ""
            replyTarget = nil
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
