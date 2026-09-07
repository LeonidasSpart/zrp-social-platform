import Foundation

/// Everything the app does with credentials and sessions.
///
/// Repositories are the only place feature code reaches for data. They
/// own the route, the request shape, and the mapping into app models;
/// ViewModels never construct an `Endpoint` and never see a raw response.
protocol AuthRepositoryProtocol: Sendable {
    func login(identifier: String, password: String) async throws -> CurrentUser
    func loginWithApple(_ credential: AppleSignInCredential) async throws -> CurrentUser
    func restoreSession() async throws -> CurrentUser?
    func logout() async
    func register(_ request: RegistrationRequest) async throws
    func checkUsername(_ username: String) async throws -> UsernameAvailability
    func resendVerification(identifier: String) async throws
    func requestPasswordReset(email: String) async throws
}

/// `POST /api/auth/register`.
///
/// The route validates all of this again - a 6-character minimum, a 3-20
/// character username, a well-formed email - and answers 400 with a
/// `field` naming which one was rejected, so the form can point at it.
struct RegistrationRequest: Encodable, Equatable {
    let name: String?
    let username: String
    let email: String
    let password: String
}

/// `GET /api/auth/check-username?username=`.
///
/// `invalid` means the format is wrong rather than the name being taken -
/// two different things to tell someone. `suggestions` are free
/// alternatives the route has already checked, and is empty when the
/// name is available.
struct UsernameAvailability: Decodable, Equatable {
    let available: Bool
    let invalid: Bool
    let suggestions: [String]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        available = try container.decodeIfPresent(Bool.self, forKey: .available) ?? false
        invalid = try container.decodeIfPresent(Bool.self, forKey: .invalid) ?? false
        suggestions = try container.decodeIfPresent([String].self, forKey: .suggestions) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case available, invalid, suggestions
    }
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

    private struct AppleLoginRequest: Encodable {
        struct FullName: Encodable {
            let givenName: String?
            let familyName: String?
        }

        let identityToken: String
        let nonce: String
        /// Omitted entirely when Apple sent no name - which is every
        /// sign-in after the first. An empty object would be noise.
        let fullName: FullName?
    }

    /// `POST /api/mobile/auth/apple`.
    ///
    /// Sends the identity token exactly as Apple issued it, plus the raw
    /// nonce this attempt used. The route verifies the signature against
    /// Apple's published keys, checks issuer, audience, expiry and that
    /// nonce, and only then mints the same NextAuth session token the
    /// password and Google logins return. Nothing about the identity is
    /// asserted from here.
    func loginWithApple(_ credential: AppleSignInCredential) async throws -> CurrentUser {
        let name: AppleLoginRequest.FullName? =
            credential.givenName == nil && credential.familyName == nil
                ? nil
                : AppleLoginRequest.FullName(
                    givenName: credential.givenName,
                    familyName: credential.familyName
                )

        let response: LoginResponse = try await client.send(
            try Endpoint.post(
                "mobile/auth/apple",
                body: AppleLoginRequest(
                    identityToken: credential.identityToken,
                    nonce: credential.nonce,
                    fullName: name
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

    // MARK: - Registration and recovery

    /// Creates an account.
    ///
    /// Succeeds with 201 and no session: the route creates the user,
    /// emails a verification link, and returns a message. **Logging in is
    /// refused with 403 until that link is opened** (`verifyCredentials`
    /// in src/lib/auth.ts), so the app must not pretend the account is
    /// ready to use.
    ///
    /// Rejections come back as 400 with the offending `field` - "email"
    /// or "username" - which is what lets the form mark the right box.
    func register(_ request: RegistrationRequest) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("auth/register", body: request, requiresAuth: false)
        )
    }

    /// Live username availability, with free alternatives when taken.
    func checkUsername(_ username: String) async throws -> UsernameAvailability {
        try await client.send(
            Endpoint.get(
                "auth/check-username",
                query: [("username", username)],
                requiresAuth: false
            )
        )
    }

    /// Re-sends the verification email.
    ///
    /// The route accepts an email **or** a username, which matters: after
    /// a failed sign-in the app already holds whatever identifier was
    /// typed, and can offer to resend without asking for it again.
    func resendVerification(identifier: String) async throws {
        struct Request: Encodable { let email: String }
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "auth/resend-verification",
                body: Request(email: identifier),
                requiresAuth: false
            )
        )
    }

    /// Requests a password-reset email.
    ///
    /// Deliberately answers the same way whether or not the address
    /// exists - the route refuses to confirm which addresses have
    /// accounts, and the app must not undo that by reporting "no such
    /// user".
    ///
    /// The reset itself is completed through the emailed link, which
    /// opens on the web. There is no route that resets a password from a
    /// code typed into an app, so this does not invent one.
    func requestPasswordReset(email: String) async throws {
        struct Request: Encodable { let email: String }
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "auth/forgot-password",
                body: Request(email: email),
                requiresAuth: false
            )
        )
    }
}
