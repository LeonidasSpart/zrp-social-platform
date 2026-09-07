import Foundation

protocol CreatorStudioRepositoryProtocol: Sendable {
    func studio() async throws -> CreatorStudio
}

struct CreatorStudioRepository: CreatorStudioRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// Everything in one request: totals, a 30-day engagement trend, the
    /// top five posts, and follower growth.
    ///
    /// Signed-in only (401 otherwise) and scoped to the caller by the
    /// session - there is no user parameter, so this can only ever
    /// return the viewer's own statistics. It is not role-gated: any
    /// account can see its own numbers, exactly as on the website.
    func studio() async throws -> CreatorStudio {
        try await client.send(Endpoint.get("creator/studio"))
    }
}
