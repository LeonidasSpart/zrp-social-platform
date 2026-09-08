import Foundation

protocol NewsRepositoryProtocol: Sendable {
    func articles(category: NewsCategory?, cursor: String?) async throws -> NewsPage
    func article(slug: String) async throws -> NewsArticle
}

struct NewsRepository: NewsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/news` — the public feed, no session required.
    ///
    /// The cursor is a `publishedAt` timestamp rather than an opaque
    /// token, and the route answers 400 for one it cannot parse, so it is
    /// passed back exactly as received and never constructed here.
    func articles(category: NewsCategory?, cursor: String?) async throws -> NewsPage {
        struct Response: Decodable {
            struct Pagination: Decodable {
                let nextCursor: String?
            }
            let articles: [NewsArticle]?
            let pagination: Pagination?
        }

        let filter = category.flatMap { $0 == .unknown ? nil : $0.rawValue }
        let response: Response = try await client.send(
            Endpoint.get(
                "news",
                query: [("category", filter), ("cursor", cursor)],
                // Public: the website serves this page signed out.
                requiresAuth: false
            )
        )
        return NewsPage(
            articles: response.articles ?? [],
            nextCursor: response.pagination?.nextCursor
        )
    }

    /// `GET /api/news/{slug}` — one article. Reading it is also what
    /// increments its view count, server-side; nothing here reports a
    /// view separately.
    func article(slug: String) async throws -> NewsArticle {
        struct Response: Decodable {
            let article: NewsArticle
        }
        let response: Response = try await client.send(
            Endpoint.get("news/\(Endpoint.segment(slug))", requiresAuth: false)
        )
        return response.article
    }
}
