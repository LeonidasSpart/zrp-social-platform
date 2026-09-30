import Foundation
import SwiftUI

/// The unread counts behind the Messages and Notifications badges.
///
/// Reads `GET /api/messages/unread` - the same dedicated endpoint the
/// website's own badge uses - rather than deriving a number from an
/// already-fetched conversation list, which the toolbar does not have
/// access to and which would be stale the moment a message arrived.
///
/// Also listens on the app's session-long socket (`ZrpSocket.shared`,
/// already held open for calling/presence - see `MainTabView`) for
/// `receive-message` / `receive-group-message` / `notification:new`,
/// the exact three events `UnreadCountContext.tsx` listens for on web,
/// so a badge updates the moment something arrives rather than only on
/// the next tab switch or app launch.
@MainActor
final class UnreadBadgeViewModel: ObservableObject {

    @Published private(set) var messageCount = 0
    @Published private(set) var notificationCount = 0

    private let repository: MessagesRepositoryProtocol
    private let notifications: NotificationsRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?

    init(
        repository: MessagesRepositoryProtocol = MessagesRepository(),
        notifications: NotificationsRepositoryProtocol = NotificationsRepository(),
        socket: ZrpSocket? = nil
    ) {
        self.repository = repository
        self.notifications = notifications
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated.
        self.socket = socket ?? .shared
    }

    /// A failure here is deliberately silent: an unread badge is not
    /// worth an error state, and the count simply stays as it was.
    func refresh() async {
        // Two independent counts from two dedicated endpoints, fetched
        // together so one failing does not hide the other.
        async let messages = try? repository.unreadCount()
        async let alerts = try? notifications.unreadCount()
        let (messageResult, alertResult) = await (messages, alerts)
        if let messageResult { messageCount = messageResult }
        if let alertResult { notificationCount = alertResult }
    }

    /// Starts listening for live updates. Safe to call repeatedly - the
    /// second call is a no-op, matching every other socket-backed store
    /// in this app.
    func startListening() {
        guard socketToken == nil else { return }
        socketToken = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "receive-message", "receive-group-message":
                Task { await self.refreshMessageCount() }
            case "notification:new":
                Task { await self.refreshNotificationCount() }
            default:
                break
            }
        }
    }

    func stopListening() {
        if let socketToken { socket.unsubscribe(socketToken) }
        socketToken = nil
    }

    private func refreshMessageCount() async {
        if let count = try? await repository.unreadCount() { messageCount = count }
    }

    private func refreshNotificationCount() async {
        if let count = try? await notifications.unreadCount() { notificationCount = count }
    }

    /// Called after the notifications list marks everything read, so the
    /// badge clears without waiting for the next refresh.
    func clearNotificationCount() {
        notificationCount = 0
    }
}
