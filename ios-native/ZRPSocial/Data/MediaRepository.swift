import Foundation

/// A GIF from the backend's Giphy proxy.
///
/// Giphy returns `width` and `height` as **strings**, not numbers, and
/// the ZRP route passes them straight through. They are deliberately not
/// modelled: nothing in the app needs them, and decoding a JSON string
/// into an `Int` would fail the whole response. Unknown keys are ignored
/// by `Decodable`, so leaving them out is both correct and safer.
struct GifResult: Decodable, Identifiable, Equatable {
    let id: String
    let url: String
    let title: String?
}

struct GifsResponse: Decodable {
    let results: [GifResult]
}

protocol MediaRepositoryProtocol: Sendable {
    func trendingGifs() async throws -> [GifResult]
    func searchGifs(query: String) async throws -> [GifResult]
    func uploadPostMedia(
        _ candidate: UploadCandidate,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia
}

struct MediaRepository: MediaRepositoryProtocol {

    private let client: ApiClient
    private let uploader: UploadThingClient

    init(client: ApiClient = .shared, uploader: UploadThingClient = UploadThingClient()) {
        self.client = client
        self.uploader = uploader
    }

    /// Both GIF routes proxy through the ZRP backend to Giphy
    /// server-side, exactly as the website's own picker does - the client
    /// never talks to Giphy directly and never holds a Giphy key.
    ///
    /// When `GIPHY_API_KEY` is unset the routes answer 503 ("GIF search
    /// is not configured"), which surfaces as a normal `ApiError` rather
    /// than an empty list, so the UI can say the feature is unavailable
    /// instead of implying there are no results.
    func trendingGifs() async throws -> [GifResult] {
        let response: GifsResponse = try await client.send(Endpoint.get("gifs/trending"))
        return response.results
    }

    func searchGifs(query: String) async throws -> [GifResult] {
        let response: GifsResponse = try await client.send(
            Endpoint.get("gifs/search", query: [("q", query)])
        )
        return response.results
    }

    /// Uploads through the `postMedia` router entry, whose middleware
    /// authenticates the caller and applies their plan's video size limit
    /// server-side.
    func uploadPostMedia(
        _ candidate: UploadCandidate,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia {
        try await uploader.upload(candidate, to: .postMedia, onProgress: onProgress)
    }
}
