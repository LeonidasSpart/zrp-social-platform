import Foundation

/// Holds the mobile session issued by `POST /api/mobile/auth/login`.
///
/// The native app has no cookie jar, so it authenticates the way that
/// endpoint was designed for: it stores the NextAuth-format token that
/// route mints and replays it as the very same cookie a browser session
/// would carry. Every one of the API's existing routes already trusts
/// that cookie however it arrives, so nothing server-side needs to know
/// a native client exists.
///
/// Reads and writes are serialised behind a lock because `ApiClient`
/// touches this from whatever queue a `URLSession` task completed on,
/// while the UI reads it from the main actor.
final class SessionStore: @unchecked Sendable {

    /// The token itself, and the cookie name the server told us to send
    /// it under. The name is stored rather than assumed because the
    /// server chooses between `__Secure-next-auth.session-token` and
    /// `next-auth.session-token` based on whether it is running under
    /// HTTPS - hardcoding either would break one of those deployments.
    struct Session: Equatable {
        let token: String
        let cookieName: String
    }

    static let shared = SessionStore()

    private let lock = NSLock()
    private var cached: Session?
    private var didLoad = false

    private enum Key {
        static let token = "session_token"
        static let cookieName = "session_cookie_name"
    }

    /// Matches the server's secure-context default (see `secureCookieName()`
    /// in the login route). Only used if a token was somehow stored
    /// without its accompanying name.
    private static let defaultCookieName = "__Secure-next-auth.session-token"

    private init() {}

    var current: Session? {
        lock.lock()
        defer { lock.unlock() }
        if !didLoad {
            didLoad = true
            if let token = Keychain.get(Key.token) {
                cached = Session(
                    token: token,
                    cookieName: Keychain.get(Key.cookieName) ?? Self.defaultCookieName
                )
            }
        }
        return cached
    }

    var isSignedIn: Bool { current != nil }

    func save(token: String, cookieName: String) {
        lock.lock()
        defer { lock.unlock() }
        do {
            try Keychain.set(token, for: Key.token)
            try Keychain.set(cookieName, for: Key.cookieName)
            cached = Session(token: token, cookieName: cookieName)
            didLoad = true
        } catch {
            // A Keychain write failing is genuinely exceptional (a
            // locked device during a foreground sign-in, a provisioning
            // problem). Keep the session in memory so the current
            // launch still works rather than dead-ending the user, and
            // let the next launch fall back to signed-out.
            //
            // Deliberately logs only the failure, never the token.
            ZrpLog.error("Keychain write failed; session held in memory for this launch only")
            cached = Session(token: token, cookieName: cookieName)
            didLoad = true
        }
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }
        Keychain.removeAll()
        cached = nil
        didLoad = true
    }
}
