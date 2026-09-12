import Foundation

protocol TransparencyRepositoryProtocol: Sendable {
    func charity() async throws -> CharityTransparency
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
}
