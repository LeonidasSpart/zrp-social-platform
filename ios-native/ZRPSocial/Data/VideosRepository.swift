import Foundation

protocol VideosRepositoryProtocol: Sendable {
    func videos(cursor: String?, startId: String?) async throws -> PostsPage
}

struct VideosRepository: VideosRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/videos` - the vertical video feed, the same route the
    /// website's /shorts page and Android's ShortsScreen read.
    ///
    /// `startId` is the route's own way of opening the feed *on* a
    /// particular video: it returns that post first, then everything
    /// older, in one page. It is what makes tapping a video in the
    /// timeline land on that video rather than at the top of the feed.
    /// The route ignores it when a cursor is present, and falls back to
    /// the normal feed if the id is not a real video - so a stale link
    /// degrades to "the video feed" rather than to an error.
    func videos(cursor: String?, startId: String?) async throws -> PostsPage {
        struct Page: Decodable {
            let posts: [Post]?
            let nextCursor: String?
        }
        let page: Page = try await client.send(
            Endpoint.get(
                "videos",
                query: [("cursor", cursor), ("startId", cursor == nil ? startId : nil)]
            )
        )
        return PostsPage(posts: page.posts ?? [], nextCursor: page.nextCursor)
    }
}
