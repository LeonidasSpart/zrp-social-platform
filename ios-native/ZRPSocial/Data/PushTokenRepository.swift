import Foundation

/// Registers/unregisters this device's two independent push
/// subscriptions with the existing ZRP backend: the ordinary APNs alert
/// token (`POST/DELETE /api/push/fcm`, the same route Android's FCM
/// token already uses - `platform: "ios"` is already accepted there, see
/// `src/app/api/push/fcm/route.ts`) and the separate PushKit VoIP token
/// (`POST/DELETE /api/push/voip`, new surface - see that route's own doc
/// comment for why it isn't an overload of `/api/push/fcm`). Both are
/// upserted keyed on the token itself server-side, so re-registering on
/// every launch/login is always safe and never accumulates duplicate
/// rows.
protocol PushTokenRepositoryProtocol: Sendable {
    func registerAlertToken(_ token: String) async throws
    func unregisterAlertToken(_ token: String) async throws
    func registerVoipToken(_ token: String) async throws
    func unregisterVoipToken(_ token: String) async throws
}

struct PushTokenRepository: PushTokenRepositoryProtocol {

    private struct TokenRequest: Encodable {
        let token: String
        let platform: String?

        init(token: String, platform: String? = nil) {
            self.token = token
            self.platform = platform
        }
    }

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func registerAlertToken(_ token: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("push/fcm", body: TokenRequest(token: token, platform: "ios"))
        )
    }

    func unregisterAlertToken(_ token: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.delete("push/fcm", body: TokenRequest(token: token))
        )
    }

    func registerVoipToken(_ token: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("push/voip", body: TokenRequest(token: token, platform: "ios"))
        )
    }

    func unregisterVoipToken(_ token: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.delete("push/voip", body: TokenRequest(token: token))
        )
    }
}
