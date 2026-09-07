import Foundation

/// Everything the app does with credentials and sessions.
///
/// Repositories are the only place feature code reaches for data. They
/// own the route, the request shape, and the mapping into app models;
/// ViewModels never construct an `Endpoint` and never see a raw response.
protocol AuthRepositoryProtocol: Sendable {
    func login(identifier: String, password: String) async throws -> CurrentUser
    func restoreSession() async throws -> CurrentUser?
    func logout() async
}

struct AuthRepository: AuthRepositoryProtocol {

    private let client: ApiClient
    private let sessionStore: SessionStore

    init(client: ApiClient = .shared, sessionStore: SessionStore = .shared) {
        self.client = client
        self.sessionStore = sessionStore
    }

    private struct LoginRequest: Encodable {
        let identifier: String
        let password: String
    }

    /// `POST /api/mobile/auth/login`.
    ///
    /// The one endpoint built specifically for native clients: it verifies
    /// credentials with the same `verifyCredentials()` the website's own
    /// login uses, then mints a real NextAuth-format encrypted JWT and
    /// returns it as a plain string. Storing that token and replaying it
    /// as the session cookie is what makes every other route work here.
    func login(identifier: String, password: String) async throws -> CurrentUser {
        let response: LoginResponse = try await client.send(
            try Endpoint.post(
                "mobile/auth/login",
                body: LoginRequest(
                    identifier: identifier.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                ),
                // The whole point of this call is to obtain a session, so
                // it must not require one.
                requiresAuth: false
            )
        )

        sessionStore.save(token: response.sessionToken, cookieName: response.cookieName)
        return CurrentUser(from: response.user)
    }

    /// Confirms a stored token is still accepted, and resolves who it
    /// belongs to.
    ///
    /// Returns `nil` when there is no stored session, or when the server
    /// says the session carries no user. A 401 propagates as
    /// `ApiError.unauthorized` after `ApiClient` has already cleared the
    /// stored credentials.
    func restoreSession() async throws -> CurrentUser? {
        guard sessionStore.isSignedIn else { return nil }

        let response: SessionResponse = try await client.send(
            Endpoint.get("auth/session")
        )

        guard let user = CurrentUser(from: response.user) else {
            // A stored token that resolves to no user is not a usable
            // session - most often the underlying User row was deleted,
            // which a self-contained signed JWT cannot know about.
            sessionStore.clear()
            return nil
        }
        return user
    }

    /// Drops the local session.
    ///
    /// There is deliberately no server call here. NextAuth's sign-out
    /// endpoint invalidates a browser cookie jar, which this client does
    /// not have; the token is stateless and self-contained, so discarding
    /// it *is* the sign-out. Phase 11 adds the one genuine server-side
    /// step - `DELETE /api/push/fcm` to stop pushes reaching a signed-out
    /// device - once device push exists at all (see PARITY.md, B3).
    func logout() async {
        sessionStore.clear()
    }
}
