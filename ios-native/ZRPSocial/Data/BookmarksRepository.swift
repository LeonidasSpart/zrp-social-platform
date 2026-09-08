import Foundation

protocol BookmarksRepositoryProtocol: Sendable {
    func bookmarks(cursor: String?) async throws -> BookmarksPage
}

struct BookmarksRepository: BookmarksRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/bookmarks` - the same route the website's own Bookmarks
    /// page reads, cursor-paginated across the merged post/comment
    /// timeline. Answers 401 without a session; there is no unauthenticated
    /// form of this list.
    func bookmarks(cursor: String?) async throws -> BookmarksPage {
        struct Page: Decodable {
            let items: [BookmarkItem]?
            let nextCursor: String?
        }
        let page: Page = try await client.send(
            Endpoint.get("bookmarks", query: [("cursor", cursor)])
        )
        return BookmarksPage(items: page.items ?? [], nextCursor: page.nextCursor)
    }
}
