import Foundation

protocol NotificationsRepositoryProtocol: Sendable {
    func notifications() async throws -> [AppNotification]
    func markAllRead() async throws
    func unreadCount() async throws -> Int
}

struct NotificationsRepository: NotificationsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// A bare array of the 50 most recent, newest first. Not paginated -
    /// 50 is the route's hard `take`, so there is nothing beyond it to
    /// fetch and the screen shows no "load more".
    func notifications() async throws -> [AppNotification] {
        try await client.send(Endpoint.get("notifications"))
    }

    /// Marks every unread notification read at once - the only granularity
    /// the route offers. There is no per-notification read endpoint, so
    /// the app cannot mark one without marking all, and does not pretend
    /// otherwise.
    func markAllRead() async throws {
        try await client.sendIgnoringResponse(Endpoint.put("notifications"))
    }

    /// The dedicated count endpoint, which is what the website's own bell
    /// badge uses - not a number derived from the fetched list, which the
    /// toolbar does not have.
    func unreadCount() async throws -> Int {
        let response: UnreadCountResponse = try await client.send(
            Endpoint.get("notifications/unread")
        )
        return response.count
    }
}
