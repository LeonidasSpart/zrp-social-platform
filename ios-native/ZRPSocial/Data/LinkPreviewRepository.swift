import Foundation

protocol LinkPreviewRepositoryProtocol: Sendable {
    func preview(for url: String) async throws -> LinkPreview
}

/// `GET /api/link-preview?url=…`.
///
/// The route does its own caching (a week for a real preview, an hour
/// for a page it read and found nothing in, a minute for one it could
/// not reach), which is why nothing is cached here: a second look at the
/// same post is answered from the server's cache without an outbound
/// fetch. It is rate limited to 30 fresh lookups a minute per client,
/// and cached answers do not count against that.
struct LinkPreviewRepository: LinkPreviewRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func preview(for url: String) async throws -> LinkPreview {
        try await client.send(Endpoint.get("link-preview", query: [("url", url)]))
    }
}
