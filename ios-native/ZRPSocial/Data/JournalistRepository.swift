import Foundation

struct JournalistApplication: Encodable {
    let outlet: String?
    let pitch: String
    let portfolioUrl: String?
}

/// The body `POST`/`PATCH` on an article accept.
///
/// Every field is optional on PATCH because the route treats **absent**
/// as "leave it alone" - it spreads each key only when it is present.
/// Sending a full object on every edit would overwrite fields the editor
/// never showed.
struct ArticleDraft: Encodable {
    var title: String?
    var slug: String?
    var excerpt: String?
    var content: String?
    var coverImage: String?
    var sourceName: String?
    var sourceUrl: String?
    var category: String?

    /// PATCH only. `true` moves a draft to PENDING_REVIEW, clears the
    /// previous reviewer's note, and is refused with a 403 unless the
    /// journalist is VERIFIED.
    var submit: Bool?

    /// POST only. `"DRAFT"` or `"PENDING_REVIEW"`; the second needs
    /// VERIFIED just as `submit` does.
    var status: String?
}

protocol JournalistRepositoryProtocol: Sendable {
    func dashboard() async throws -> JournalistDashboard
    func apply(_ application: JournalistApplication) async throws
    func articles(status: ArticleStatus?, page: Int) async throws -> [JournalistArticle]
    func article(id: String) async throws -> JournalistArticle
    func create(_ draft: ArticleDraft) async throws -> JournalistArticle
    func update(id: String, _ draft: ArticleDraft) async throws -> JournalistArticle
    func delete(id: String) async throws
}

struct JournalistRepository: JournalistRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/journalist/profile` - the profile, the counts, and the
    /// ten most recently touched articles.
    ///
    /// Answers for any signed-in user, journalist or not, which is what
    /// lets one screen serve both the application form and the
    /// dashboard.
    func dashboard() async throws -> JournalistDashboard {
        try await client.send(Endpoint.get("journalist/profile"))
    }

    /// `POST /api/journalist/apply`.
    ///
    /// Grants the JOURNALIST role immediately but **not** verification
    /// and **not** a badge - an admin does that on a separate route. A
    /// rejected applicant may re-apply; pending, verified and suspended
    /// applicants get a 409 with wording specific to each.
    func apply(_ application: JournalistApplication) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("journalist/apply", body: application)
        )
    }

    private struct ArticlesResponse: Decodable {
        let articles: [JournalistArticle]
    }

    /// `GET /api/journalist/articles` - the author's own, newest-touched
    /// first. Page-numbered rather than cursor-based, unlike the feeds:
    /// that is this route's own contract.
    func articles(status: ArticleStatus?, page: Int) async throws -> [JournalistArticle] {
        let response: ArticlesResponse = try await client.send(
            Endpoint.get(
                "journalist/articles",
                query: [
                    ("status", status.flatMap { $0 == .unknown ? nil : $0.rawValue }),
                    ("page", String(page)),
                    ("limit", "50"),
                ]
            )
        )
        return response.articles
    }

    private struct ArticleResponse: Decodable {
        let article: JournalistArticle
    }

    /// One article in full, including its `content` - which the
    /// dashboard's summary projection omits.
    func article(id: String) async throws -> JournalistArticle {
        let response: ArticleResponse = try await client.send(
            Endpoint.get("journalist/articles/\(Endpoint.segment(id))")
        )
        return response.article
    }

    /// `POST /api/journalist/articles`.
    ///
    /// `authorId` is never sent: the route always uses the session user
    /// precisely so nobody can attribute an article to someone else. A
    /// duplicate slug is a 409 with its own wording.
    func create(_ draft: ArticleDraft) async throws -> JournalistArticle {
        let response: ArticleResponse = try await client.send(
            try Endpoint.post("journalist/articles", body: draft)
        )
        return response.article
    }

    /// `PATCH /api/journalist/articles/{id}`.
    ///
    /// Refused with a 409 for anything that is not a DRAFT or REJECTED
    /// article, and with a 403 for a suspended journalist or for
    /// `submit` from an unverified one.
    func update(id: String, _ draft: ArticleDraft) async throws -> JournalistArticle {
        let response: ArticleResponse = try await client.send(
            try Endpoint.patch(
                "journalist/articles/\(Endpoint.segment(id))",
                body: draft
            )
        )
        return response.article
    }

    /// `DELETE /api/journalist/articles/{id}` - **drafts only**.
    ///
    /// Anything ever submitted stays for the editorial record; the route
    /// answers 409 otherwise, and the app does not offer the control.
    func delete(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("journalist/articles/\(Endpoint.segment(id))")
        )
    }
}
