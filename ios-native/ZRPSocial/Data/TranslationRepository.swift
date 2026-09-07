import Foundation

protocol TranslationRepositoryProtocol: Sendable {
    func translate(_ text: String, to targetLang: String) async throws -> String
}

/// `POST /api/translate`.
///
/// The route requires a session (401 without one), is rate limited to 30
/// calls a minute, and refuses text longer than 2000 characters with a
/// 400. It forwards to MyMemory with `autodetect` as the source
/// language, so nothing here needs to guess what a post is written in.
///
/// It reports a source language of `null` unconditionally - MyMemory
/// does not return one - so there is no "translated from" to show and
/// none is invented.
struct TranslationRepository: TranslationRepositoryProtocol {

    /// The route's own cap. Checked here so an over-long post is not
    /// sent only to come back as a 400 that would read as a failure.
    static let maxTextLength = 2000

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func translate(_ text: String, to targetLang: String) async throws -> String {
        struct Request: Encodable {
            let text: String
            let targetLang: String
        }
        struct Response: Decodable { let translatedText: String }
        let response: Response = try await client.send(
            try Endpoint.post("translate", body: Request(text: text, targetLang: targetLang))
        )
        return response.translatedText
    }
}
