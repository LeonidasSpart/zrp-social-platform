import AuthenticationServices
import CryptoKit
import Foundation
import SwiftUI

/// Sign in with Apple.
///
/// App Store rule 4.8 requires it wherever an app offers another
/// third-party sign-in, and ZRP offers Google. This is the native flow -
/// `ASAuthorizationAppleIDProvider` hands the app a signed identity
/// token directly, with no browser - and its counterpart is
/// `POST /api/mobile/auth/apple`, which verifies that token against
/// Apple's own published keys before it will mint a session.
///
/// **Nothing about the identity is trusted on this side.** The app does
/// not read the token, does not extract the email from it, and does not
/// tell the server who signed in. It forwards the token and the nonce; the
/// server decides.
enum AppleSignIn {

    /// Builds the request, with a fresh nonce bound to this attempt.
    ///
    /// Apple echoes the SHA-256 of `request.nonce` in the identity token.
    /// Sending the hash and keeping the raw value is what lets the server
    /// prove the token was minted for *this* sign-in - a token captured
    /// from another session carries a different nonce and is rejected.
    static func prepare(_ request: ASAuthorizationAppleIDRequest) -> String {
        let rawNonce = makeNonce()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(rawNonce)
        return rawNonce
    }

    /// 32 bytes of cryptographically secure randomness, hex-encoded.
    ///
    /// `SystemRandomNumberGenerator` is seeded from the system CSPRNG,
    /// which is what a nonce needs; `Int.random(in:)` on it is not the
    /// weak `arc4random`-style shortcut it can look like.
    private static func makeNonce() -> String {
        var generator = SystemRandomNumberGenerator()
        return (0..<32)
            .map { _ in String(format: "%02x", UInt8.random(in: 0...255, using: &generator)) }
            .joined()
    }

    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

/// What the app sends to `POST /api/mobile/auth/apple`.
struct AppleSignInCredential: Equatable {
    let identityToken: String
    /// The raw nonce - the server hashes it and compares against the
    /// token's claim.
    let nonce: String
    /// Apple provides a name exactly once, on the first authorization for
    /// this app, and never again. `nil` on every later sign-in, which is
    /// normal rather than an error.
    let givenName: String?
    let familyName: String?

    /// Reads what is usable out of an `ASAuthorization`.
    ///
    /// Returns `nil` when the credential is not an Apple ID credential or
    /// carries no identity token - there is nothing to send in either
    /// case, and inventing a request would only produce a confusing 400.
    init?(authorization: ASAuthorization, nonce: String) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let token = String(data: tokenData, encoding: .utf8)
        else { return nil }

        self.identityToken = token
        self.nonce = nonce
        self.givenName = credential.fullName?.givenName
        self.familyName = credential.fullName?.familyName
    }
}

/// The Sign in with Apple button, wired to the session.
///
/// `SignInWithAppleButton` is Apple's own control: its wording, corner
/// radius and localisation are dictated by the Human Interface
/// Guidelines, and a hand-drawn imitation is a review rejection. It
/// styles itself for light and dark automatically.
struct AppleSignInButton: View {

    @EnvironmentObject private var session: SessionController
    @Environment(\.colorScheme) private var colorScheme

    /// Reported to the host screen so it can show the failure in the same
    /// banner as every other sign-in error.
    let onError: (String) -> Void

    /// Held between building the request and receiving the result: the
    /// server needs the raw nonce, and only the hash left the device.
    @State private var nonce: String?

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            nonce = AppleSignIn.prepare(request)
        } onCompletion: { result in
            handle(result)
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: ZrpMetrics.minTouchTarget)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard
                let nonce,
                let credential = AppleSignInCredential(authorization: authorization, nonce: nonce)
            else {
                onError(L10n.string(.authErrSomethingWrong))
                return
            }
            self.nonce = nil
            Task { await session.signInWithApple(credential) }

        case .failure(let error):
            // Cancelling is not a failure worth a message - the person
            // decided not to sign in, and an error banner would read as
            // something having gone wrong.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            onError(L10n.string(.authErrSomethingWrong))
        }
    }
}
