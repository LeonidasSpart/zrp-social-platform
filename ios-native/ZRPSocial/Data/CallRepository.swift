import Foundation

/// The same real TURN/STUN credentials the website's `getIceServers()`
/// (`src/app/messages/[username]/page.tsx`) and the Android sibling's
/// `CallRepository.getIceServers()` fetch before starting or accepting a
/// call - see `GET /api/turn-credentials`'s own doc comment for the
/// session-required, rate-limited contract this wraps.
protocol CallRepositoryProtocol: Sendable {
    func iceServers() async throws -> [IceServer]
}

struct CallRepository: CallRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func iceServers() async throws -> [IceServer] {
        try await client.send(Endpoint.get("turn-credentials"))
    }
}
