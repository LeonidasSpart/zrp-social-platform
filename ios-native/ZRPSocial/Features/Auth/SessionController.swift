import Foundation
import SwiftUI

/// Owns "is anyone signed in, and who".
///
/// A single observable object at the root of the view tree, rather than
/// each screen asking independently. Everything that changes auth state -
/// a successful login, an explicit sign-out, or the server rejecting the
/// stored token with a 401 - funnels through here so there is exactly one
/// place the UI reacts to.
@MainActor
final class SessionController: ObservableObject {

    enum State: Equatable {
        /// Before the stored session has been checked. The app shows its
        /// launch state here rather than flashing the login screen at a
        /// user who is in fact signed in.
        case restoring
        case signedOut
        case signedIn(CurrentUser)
    }

    @Published private(set) var state: State = .restoring

    /// Set when a session ends because the server rejected it, so the
    /// login screen can explain why the user is suddenly back there
    /// instead of silently appearing.
    @Published var expiryNotice: String?

    private let repository: AuthRepositoryProtocol
    private var expiryObserver: NSObjectProtocol?

    init(repository: AuthRepositoryProtocol = AuthRepository()) {
        self.repository = repository

        expiryObserver = NotificationCenter.default.addObserver(
            forName: ApiClient.sessionExpiredNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // `ApiClient` has already cleared the Keychain by this point;
            // this only brings the UI in line with that.
            MainActor.assumeIsolated {
                self?.handleSessionExpired()
            }
        }
    }

    deinit {
        if let expiryObserver {
            NotificationCenter.default.removeObserver(expiryObserver)
        }
    }

    var currentUser: CurrentUser? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    /// Called once on launch. A stored token is verified against
    /// `GET /api/auth/session` rather than trusted blindly, so a token
    /// revoked or outlived server-side does not produce an app that looks
    /// signed in and then fails every request.
    func restore() async {
        do {
            if let user = try await repository.restoreSession() {
                state = .signedIn(user)
            } else {
                state = .signedOut
            }
        } catch ApiError.unauthorized {
            state = .signedOut
            expiryNotice = L10n.string(.authErrSessionExpired)
        } catch {
            // A restore that failed for a network reason must not sign the
            // user out - their token is probably still perfectly good. Fall
            // back to signed-out for this launch without discarding
            // anything; the next launch retries.
            ZrpLog.debug("Session restore failed (non-auth); staying signed out this launch")
            state = .signedOut
        }
    }

    /// Completes a Sign in with Apple.
    ///
    /// Lives here rather than in a view model because Apple's button
    /// appears on more than one screen and the outcome is the same
    /// everywhere: a session, or a message. `expiryNotice` carries the
    /// failure so the login screen shows it in the banner it already has.
    func signInWithApple(_ credential: AppleSignInCredential) async {
        do {
            let user = try await repository.loginWithApple(credential)
            signedIn(user)
        } catch let error as ApiError {
            expiryNotice = error.userFacingMessage
        } catch {
            expiryNotice = L10n.string(.authErrSomethingWrong)
        }
    }

    func signedIn(_ user: CurrentUser) {
        expiryNotice = nil
        state = .signedIn(user)
    }

    func signOut() async {
        // Before the token goes: a socket authenticated as this viewer
        // must not outlive them on a shared device.
        ZrpSocket.shared.disconnect()
        await repository.logout()
        expiryNotice = nil
        state = .signedOut
    }

    private func handleSessionExpired() {
        guard state != .signedOut else { return }
        ZrpSocket.shared.disconnect()
        state = .signedOut
        expiryNotice = L10n.string(.authErrSessionExpired)
    }
}
