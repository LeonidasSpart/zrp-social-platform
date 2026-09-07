import Foundation

protocol StoriesRepositoryProtocol: Sendable {
    func stories() async throws -> [StoryGroup]
    func markViewed(storyId: String) async throws
    func toggleLike(storyId: String) async throws -> Bool
    func create(content: String?, mediaUrl: String?, mediaType: String?) async throws
    func uploadStoryMedia(
        _ candidate: UploadCandidate,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia
}

struct StoriesRepository: StoriesRepositoryProtocol {

    private let client: ApiClient
    private let uploader: UploadThingClient

    init(client: ApiClient = .shared, uploader: UploadThingClient = UploadThingClient()) {
        self.client = client
        self.uploader = uploader
    }

    private struct CreateRequest: Encodable {
        let content: String?
        let mediaUrl: String?
        let mediaType: String?
    }

    /// A bare JSON array, grouped by author. 401 when signed out - this
    /// route has no anonymous mode, unlike the feeds.
    func stories() async throws -> [StoryGroup] {
        try await client.send(Endpoint.get("stories"))
    }

    /// Idempotent server-side: the route upserts the viewer's view row, so
    /// re-marking a story already seen is harmless. That is what lets the
    /// viewer fire this on every advance without tracking what it has
    /// already sent.
    func markViewed(storyId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post("stories/\(storyId)/view"))
    }

    func toggleLike(storyId: String) async throws -> Bool {
        let response: StoryLikeResponse = try await client.send(
            Endpoint.post("stories/\(storyId)/like")
        )
        return response.liked
    }

    /// The route requires content or media - it rejects a story that has
    /// neither with a 400.
    func create(content: String?, mediaUrl: String?, mediaType: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "stories",
                body: CreateRequest(
                    content: content,
                    mediaUrl: mediaUrl,
                    mediaType: mediaType
                )
            )
        )
    }

    /// Uploads through the `storyMedia` router entry rather than
    /// `postMedia`. They are genuinely different: story video is capped at
    /// a flat 16MB for everyone, where post video scales with the author's
    /// plan up to 2GB.
    func uploadStoryMedia(
        _ candidate: UploadCandidate,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia {
        try await uploader.upload(candidate, to: .storyMedia, onProgress: onProgress)
    }
}
