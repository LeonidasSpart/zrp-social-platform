import Foundation
import SwiftUI

/// The unread-message count behind the Messages badge.
///
/// Reads `GET /api/messages/unread` - the same dedicated endpoint the
/// website's own badge uses - rather than deriving a number from an
/// already-fetched conversation list, which the toolbar does not have
/// access to and which would be stale the moment a message arrived.
@MainActor
final class UnreadBadgeViewModel: ObservableObject {

    @Published private(set) var messageCount = 0

    private let repository: MessagesRepositoryProtocol

    init(repository: MessagesRepositoryProtocol = MessagesRepository()) {
        self.repository = repository
    }

    /// A failure here is deliberately silent: an unread badge is not
    /// worth an error state, and the count simply stays as it was.
    func refresh() async {
        guard let count = try? await repository.unreadCount() else { return }
        messageCount = count
    }
}
