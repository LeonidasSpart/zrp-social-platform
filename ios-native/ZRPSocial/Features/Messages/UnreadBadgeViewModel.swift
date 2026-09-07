import Foundation
import SwiftUI

/// The unread counts behind the Messages and Notifications badges.
///
/// Reads `GET /api/messages/unread` - the same dedicated endpoint the
/// website's own badge uses - rather than deriving a number from an
/// already-fetched conversation list, which the toolbar does not have
/// access to and which would be stale the moment a message arrived.
@MainActor
final class UnreadBadgeViewModel: ObservableObject {

    @Published private(set) var messageCount = 0
    @Published private(set) var notificationCount = 0

    private let repository: MessagesRepositoryProtocol
    private let notifications: NotificationsRepositoryProtocol

    init(
        repository: MessagesRepositoryProtocol = MessagesRepository(),
        notifications: NotificationsRepositoryProtocol = NotificationsRepository()
    ) {
        self.repository = repository
        self.notifications = notifications
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

    /// Called after the notifications list marks everything read, so the
    /// badge clears without waiting for the next refresh.
    func clearNotificationCount() {
        notificationCount = 0
    }
}
