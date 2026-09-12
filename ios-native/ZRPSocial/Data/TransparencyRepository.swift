import Foundation

protocol TransparencyRepositoryProtocol: Sendable {
    func charity() async throws -> CharityTransparency
    func moderation() async throws -> ModerationTransparency
}

struct TransparencyRepository: TransparencyRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/transparency/charity`.
    ///
    /// `requiresAuth: false` is correct here and was checked rather than
    /// assumed: the route calls neither `getServerSession` nor
    /// `getToken`, reads no viewer identity, and returns the same
    /// platform-wide figures to everyone. Sending a cookie would change
    /// nothing - and this page must work signed out, which is the point
    /// of publishing it.
    func charity() async throws -> CharityTransparency {
        try await client.send(Endpoint.get("transparency/charity", requiresAuth: false))
    }

    /// `GET /api/transparency/moderation`.
    ///
    /// Public for the same checked reason as the charity route - no
    /// `getServerSession`, no `getToken`, no viewer identity read - and
    /// for a stronger one: it exists so that anybody, signed in or not,
    /// can check how ZRP moderates. It returns aggregate counts only and
    /// never a reporter, a reported user, or any content.
    func moderation() async throws -> ModerationTransparency {
        try await client.send(Endpoint.get("transparency/moderation", requiresAuth: false))
    }
}
