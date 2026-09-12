import Foundation

protocol TeamRepositoryProtocol: Sendable {
    func roster() async throws -> TeamRoster
    func add(email: String, role: TeamRole) async throws
    func setRole(memberId: String, role: TeamRole) async throws
    func remove(memberId: String) async throws
}

struct TeamRepository: TeamRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/team` -> `{members, owner}`.
    ///
    /// Gated on `canManageTeam` server-side: a free or pro account gets
    /// a **403 with its own wording**, not a redirect. That matters for
    /// a native client - the middleware's plan redirect covers the web
    /// pages only, so this route always answers JSON.
    func roster() async throws -> TeamRoster {
        try await client.send(Endpoint.get("team"))
    }

    private struct AddRequest: Encodable {
        let email: String
        let role: String
    }

    /// `POST /api/team`.
    ///
    /// Everything that can go wrong has its own message and is shown as
    /// written: the plan gate, an email that belongs to nobody ("They
    /// need to sign up first"), somebody already on the team, and
    /// adding yourself. A generic "failed" would hide the only useful
    /// part of every one of them.
    func add(email: String, role: TeamRole) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "team",
                body: AddRequest(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    role: role.rawValue
                )
            )
        )
    }

    private struct RoleRequest: Encodable {
        let role: String
    }

    /// `PATCH /api/team/{memberId}` - ADMIN, EDITOR or VIEWER only.
    func setRole(memberId: String, role: TeamRole) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.patch(
                "team/\(Endpoint.segment(memberId))",
                body: RoleRequest(role: role.rawValue)
            )
        )
    }

    /// `DELETE /api/team/{memberId}`.
    ///
    /// The route verifies the membership belongs to the caller's own
    /// account before deleting - a member id from another team is a 403,
    /// not a deletion.
    func remove(memberId: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("team/\(Endpoint.segment(memberId))")
        )
    }
}

protocol ApiKeysRepositoryProtocol: Sendable {
    func keys() async throws -> [ApiKeyRecord]
    func create(name: String, expiresInDays: Int) async throws -> CreatedApiKey
    func revoke(id: String) async throws
}

struct ApiKeysRepository: ApiKeysRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct KeysResponse: Decodable {
        let keys: [ApiKeyRecord]
    }

    /// `GET /api/api-keys` - active keys only; revoked ones are filtered
    /// out server-side.
    func keys() async throws -> [ApiKeyRecord] {
        let response: KeysResponse = try await client.send(Endpoint.get("api-keys"))
        return response.keys
    }

    private struct CreateRequest: Encodable {
        let name: String
        let expiresInDays: Int
    }

    /// `POST /api/api-keys`.
    ///
    /// The response carries `plainKey`, **the only time the token is
    /// ever readable** - the server keeps a SHA-256 hash and nothing
    /// else. The caller shows it once and holds it in memory; this app
    /// does not persist it anywhere.
    ///
    /// The route caps an account at ten active keys and rejects an
    /// eleventh with a 400, and it may answer 409 under genuine
    /// concurrency after exhausting its own retries. Both carry their
    /// own wording.
    func create(name: String, expiresInDays: Int) async throws -> CreatedApiKey {
        try await client.send(
            try Endpoint.post(
                "api-keys",
                body: CreateRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    expiresInDays: expiresInDays
                )
            )
        )
    }

    /// `DELETE /api/api-keys/{id}` - a soft revoke, not a delete. The
    /// row stays and stops authenticating.
    func revoke(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("api-keys/\(Endpoint.segment(id))")
        )
    }
}
